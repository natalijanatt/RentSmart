# Skill: Inspections Module

## Context

Handles the check-in and check-out flows: starting an inspection, uploading images with metadata validation, completing the inspection, and the approval/rejection cycle. This module deals with Supabase Storage for image upload/download and validates GPS, timestamp, and device consistency.

## Files in scope

```
src/modules/inspections/
├── inspections.routes.ts       # All checkin/* and checkout/* endpoints
├── inspections.service.ts      # Orchestrates: validate → upload → state transition
├── inspections.schema.ts       # Zod schemas for reject body, etc.
├── imageService.ts             # Supabase Storage: upload, download, getSignedUrl
└── metadataValidator.ts        # GPS proximity, timestamp drift, device consistency
```

## Dependencies

- shared/db/client (pg Pool + Supabase client for Storage)
- shared/types (InspectionImage, Contract, Room)
- shared/utils/hash (sha256Buffer for image hashing)
- shared/utils/geo (haversineDistance for GPS validation)
- shared/utils/errors (AppError)
- modules/contracts/stateMachine (validateTransition, getActorRole)
- modules/contracts/contracts.service (transitionStatus)
- modules/audit/audit.service (logAuditEvent)
- modules/blockchain/solana.service (recordCheckin, recordCheckout — optional)

## API endpoints

```
POST /api/v1/contracts/:id/checkin/start      # landlord starts
POST /api/v1/contracts/:id/checkin/images     # multipart upload
POST /api/v1/contracts/:id/checkin/complete   # landlord finishes
POST /api/v1/contracts/:id/checkin/approve    # tenant approves
POST /api/v1/contracts/:id/checkin/reject     # tenant rejects
GET  /api/v1/contracts/:id/checkin/images     # get images (thumbnails for checkout)

POST /api/v1/contracts/:id/checkout/start     # tenant starts
POST /api/v1/contracts/:id/checkout/images    # multipart upload
POST /api/v1/contracts/:id/checkout/complete  # tenant finishes
POST /api/v1/contracts/:id/checkout/approve   # landlord approves
POST /api/v1/contracts/:id/checkout/reject    # landlord rejects
```

## Multipart upload format

The `/checkin/images` and `/checkout/images` endpoints accept `multipart/form-data`:

```
images[]        File[] (1-10 JPEG images for ONE room)
room_id         UUID
captured_at[]   ISO timestamp per image
gps_lat         number
gps_lng         number
device_id       string
notes[]         string[] (optional note per image)
```

Use `multer` for multipart parsing:

```typescript
import multer from 'multer';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

// In route:
router.post('/:id/checkin/images',
  authMiddleware,
  upload.array('images', 10),
  asyncHandler(async (req, res) => { ... })
);
```

## Metadata validator: metadataValidator.ts

```typescript
import { haversineDistance } from '../../shared/utils/geo';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateImageMetadata(
  contractGps: { lat: number; lng: number } | null,
  metadata: { captured_at: string; gps_lat: number; gps_lng: number; device_id: string },
  sessionDeviceId: string | null  // first image's device_id becomes the session device
): ValidationResult {
  const errors: string[] = [];

  // 1. Timestamp: within ±1 hour of server time
  const timeDiff = Math.abs(Date.now() - new Date(metadata.captured_at).getTime());
  if (timeDiff > 3600000) {
    errors.push(`Timestamp is ${Math.round(timeDiff / 60000)} minutes from server time (max ±60min)`);
  }

  // 2. GPS: within 200m of property address (if contract has GPS)
  if (contractGps) {
    const distance = haversineDistance(
      contractGps.lat, contractGps.lng,
      metadata.gps_lat, metadata.gps_lng
    );
    if (distance > 200) {
      errors.push(`GPS is ${Math.round(distance)}m from property (max 200m)`);
    }
  }

  // 3. Device consistency: same device throughout the session
  if (sessionDeviceId && metadata.device_id !== sessionDeviceId) {
    errors.push(`Device changed mid-session: expected ${sessionDeviceId}, got ${metadata.device_id}`);
  }

  return { valid: errors.length === 0, errors };
}
```

## Image service: imageService.ts

```typescript
import { supabase } from '../../shared/db/client';
import { sha256Buffer } from '../../shared/utils/hash';

const BUCKET = 'rentsmart-images';

export async function uploadImage(
  contractId: string,
  inspectionType: 'checkin' | 'checkout',
  roomType: string,
  imageBuffer: Buffer,
  index: number
): Promise<{ url: string; hash: string }> {
  const hash = sha256Buffer(imageBuffer);
  const path = `${contractId}/${inspectionType}/${roomType}/img_${String(index).padStart(3, '0')}_${hash.slice(0, 8)}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, hash };
}

export async function downloadImage(imageUrl: string): Promise<Buffer> {
  // Extract path from URL, download from Supabase Storage
  const path = imageUrl.split(`${BUCKET}/`)[1];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (error || !data) throw new Error(`Image download failed: ${error?.message}`);

  return Buffer.from(await data.arrayBuffer());
}

export async function getImagesByContract(
  contractId: string,
  inspectionType: 'checkin' | 'checkout'
): Promise<InspectionImage[]> {
  const result = await db.query<InspectionImage>(
    `SELECT * FROM inspection_images
     WHERE contract_id = $1 AND inspection_type = $2
     ORDER BY room_id, image_index`,
    [contractId, inspectionType]
  );
  return result.rows;
}
```

## Service: inspections.service.ts — key operations

```typescript
// Start check-in/checkout
export async function startInspection(
  contractId: string, user: User, type: 'checkin' | 'checkout'
): Promise<void>
// Validates: correct status, correct actor role
// Transitions: accepted → checkin_in_progress OR active → checkout_in_progress

// Upload images for one room
export async function uploadRoomImages(
  contractId: string, user: User, type: 'checkin' | 'checkout',
  roomId: string, files: Express.Multer.File[], metadata: ImageMetadata[]
): Promise<InspectionImage[]>
// Validates: metadata (GPS, timestamp, device), contract is in *_in_progress status
// Uploads to Supabase Storage, inserts inspection_images rows, logs audit events

// Complete inspection
export async function completeInspection(
  contractId: string, user: User, type: 'checkin' | 'checkout'
): Promise<void>
// Validates: all mandatory rooms have ≥3 images
// Transitions: *_in_progress → *_pending_approval

// Approve inspection
export async function approveInspection(
  contractId: string, user: User, type: 'checkin' | 'checkout'
): Promise<void>
// Transitions: checkin_pending_approval → active OR checkout_pending_approval → pending_analysis
// On checkout approve: triggers analysis automatically

// Reject inspection
export async function rejectInspection(
  contractId: string, user: User, type: 'checkin' | 'checkout',
  comment: string
): Promise<void>
// Transitions: *_pending_approval → *_rejected
// Stores rejection_comment on contract
```

## Zod schemas: inspections.schema.ts

```typescript
import { z } from 'zod';

export const rejectInspectionSchema = z.object({
  comment: z.string().min(1).max(1000),
});

export type RejectInspectionInput = z.infer<typeof rejectInspectionSchema>;
```

## Who photographs what

- **Check-in: LANDLORD photographs** — documenting the state they're handing over
- **Check-out: TENANT photographs** — documenting the state they're returning
- **Approval: the OTHER party** confirms the photos are accurate
- **Rejection: the OTHER party** says photos are inadequate, with a comment

## DO

- DO validate that all mandatory rooms have ≥3 images before allowing `complete`
- DO validate GPS proximity to contract address for each image
- DO validate timestamp is within ±1 hour of server time
- DO validate device consistency throughout the inspection session
- DO hash each image (SHA-256) for integrity verification
- DO store the hash in inspection_images table
- DO auto-trigger analysis after checkout approval (POST /analyze)
- DO delete old images when a rejection triggers a re-upload for the same room

## NEVER

- NEVER allow check-in by tenant or check-out by landlord — roles are fixed
- NEVER allow image upload if contract is not in `*_in_progress` status
- NEVER skip metadata validation — it's core to the trust model
- NEVER store images in PostgreSQL — use Supabase Storage
- NEVER allow more than 10 images per room per upload
- NEVER allow upload for a room that doesn't belong to the contract

## Checklist

- [ ] multer configured with memoryStorage, 10MB limit, JPEG/PNG filter
- [ ] Metadata validation: GPS within 200m, timestamp within ±1h, device consistent
- [ ] Image hash computed and stored
- [ ] Images uploaded to Supabase Storage with correct path structure
- [ ] All mandatory rooms validated before complete
- [ ] Approval triggers correct state transition
- [ ] Checkout approval auto-triggers analysis
- [ ] Rejection stores comment and transitions back to *_in_progress
- [ ] GET images endpoint returns images grouped by room
- [ ] All operations log appropriate audit events