import { z } from 'zod';

// Zod Schemas
export const phoneSchema = z
  .string()
  .regex(
    /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im,
    'Invalid phone number'
  );

export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters');

export const addressSchema = z
  .string()
  .min(5, 'Address must be at least 5 characters')
  .max(500, 'Address must not exceed 500 characters');

export const contractCreateSchema = z.object({
  property_address: addressSchema,
  rent_monthly_eur: z
    .number()
    .positive('Rent must be positive')
    .max(50000, 'Rent must not exceed €50,000'),
  deposit_amount_eur: z
    .number()
    .nonnegative('Deposit must be non-negative')
    .max(100000, 'Deposit must not exceed €100,000'),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  rooms: z
    .array(
      z.object({
        type: z.string(),
        square_meters: z.number().positive().optional(),
      })
    )
    .optional(),
});

export const profileUpdateSchema = z.object({
  display_name: nameSchema,
});

// Validation function
export const validateForm = <T extends Record<string, any>>(
  schema: z.ZodSchema<T>,
  data: any
): { success: boolean; errors?: Record<string, string> } => {
  try {
    schema.parse(data);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { general: 'Validation failed' } };
  }
};
