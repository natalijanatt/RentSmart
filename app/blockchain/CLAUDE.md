# CLAUDE.md — RentSmart Blockchain

## Šta je ovaj modul

Samostalni Solana blockchain modul za RentSmart. Sadrži Anchor smart contract program (Rust) i TypeScript klijent koji implementira `ISolanaService` interfejs.

Ovaj modul je **potpuno odvojen** od server koda — može se razvijati, testirati i deployovati nezavisno. Integracija sa serverom se odvija u jednom koraku (vidi sekciju **Integracija**).

### Šta blockchain radi

Solana se koristi za tri stvari:

1. **Nepromenljiv zapis** — hash ugovora i hash-evi inspekcijskih slika upisani on-chain
2. **Escrow depozita** — stanareva SOL sredstva zaključana u PDA dok ugovor traje
3. **Automatska raspodela** — execute_settlement() šalje tačne iznose stanodavcu i stanaru bez posrednika

Backend (server) je autoritativan sistem — blockchain je bonus layer dokaza. Ako Solana poziv ne uspe, server nastavlja sa radom (graceful degradation).

---

## Tech stack

- **Smart contract:** Rust, Anchor framework v0.30
- **TypeScript klijent:** @coral-xyz/anchor, @solana/web3.js
- **Mreža:** Solana Devnet (testiranje), Mainnet (produkcija)
- **Alati:** Solana CLI, Anchor CLI, Rust toolchain

---

## Struktura

```
app/blockchain/
├── CLAUDE.md                        # Ovaj fajl
├── Anchor.toml                      # Anchor konfiguracija (program IDs, provider)
├── Cargo.toml                       # Rust workspace root
├── package.json                     # Node/TS klijent zavisnosti (@rentsmart/blockchain)
├── tsconfig.json                    # TypeScript konfiguracija za klijent
├── .env.example                     # Blockchain env varijable
│
├── programs/
│   └── rentsmart/
│       ├── Cargo.toml               # Rust crate definicija
│       └── src/
│           └── lib.rs               # Anchor program — jedini Rust fajl
│
├── client/
│   └── src/
│       ├── index.ts                 # Export barrel — ovo importuje server
│       ├── interface.ts             # ISolanaService interfejs (izvor istine)
│       ├── solanaService.ts         # Konkretna implementacija
│       └── types.ts                 # On-chain tipovi i enum-ovi
│
└── tests/
    └── rentsmart.ts                 # Anchor testovi (mocha + chai)
```

---

## Prerekviziti

Potrebno instalirati pre rada:

```bash
# 1. Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rust-analyzer

# 2. Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
# Provjeri: solana --version  (≥1.18)

# 3. Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
# Provjeri: anchor --version  (0.30.1)

# 4. Node.js zavisnosti
cd app/blockchain
npm install
```

---

## Setup dev okruženja

### Lokalni keypair (authority wallet)

```bash
# Generiši keypair (jedan put)
solana-keygen new --outfile ~/.config/solana/rentsmart-authority.json

# Postavi kao default
solana config set --keypair ~/.config/solana/rentsmart-authority.json

# Dobavi test SOL (devnet)
solana airdrop 2 --url devnet

# Provjeri balans
solana balance --url devnet

# Exportuj keypair kao JSON array (za env varijablu)
cat ~/.config/solana/rentsmart-authority.json
# Kopiraj cijeli niz u SOLANA_AUTHORITY_KEYPAIR
```

### .env fajl

```bash
cp .env.example .env
# Popuni SOLANA_AUTHORITY_KEYPAIR i SOLANA_PROGRAM_ID (nakon deploya)
```

---

## Pokretanje lokalnih testova

### Opcija A: Anchor test (lokalni validator)

```bash
# Iz app/blockchain/ direktorijuma
anchor test

# Ovo automatski:
# 1. Kompajlira Rust program
# 2. Pokreće solana-test-validator
# 3. Deployuje program lokalno
# 4. Pokreće TypeScript testove
# 5. Gasi validator
```

### Opcija B: Ručni lokalni validator

```bash
# Terminal 1: Pokreni validator
solana-test-validator

# Terminal 2: Build i deploy
anchor build
anchor deploy --provider.cluster localnet

# Terminal 3: Pokreni testove
anchor run test
```

### Opcija C: Devnet testovi

```bash
# Postavi SOLANA_PROGRAM_ID u .env (nakon deploy --provider.cluster devnet)
anchor test --provider.cluster devnet
```

---

## Build

```bash
# Kompajliraj Rust program
anchor build
# Output: target/deploy/rentsmart.so i target/idl/rentsmart.json

# TypeScript klijent
npm run build
# Output: dist/
```

**Važno:** Nakon svakog `anchor build`, IDL se automatski generiše u `target/idl/rentsmart.json`. Klijent ga čita pri runtime-u.

---

## Anchor program (programs/rentsmart/src/lib.rs)

### PDA dizajn

Svaki ugovor ima svoju Program Derived Account (PDA):

```
seeds = ["rental", contract_id_as_bytes]
```

- `contract_id` je UUID string bez crtica (32 ASCII karaktera), npr. `"550e8400e29b41d4a716446655440000"` — format zadovoljava Solana PDA seed limit od 32 bajta po seed-u
- PDA nije vlastnik novca — ona JE escrow (SOL se deponuje direktno u PDA account)
- Backend authority keypair potpisuje sve instrukcije osim `lock_deposit` (potpisuje stanar)

### Instrukcije

| Instrukcija          | Ko potpisuje | Šta radi                                                     |
| -------------------- | ------------ | ------------------------------------------------------------ |
| `initialize`         | authority    | Kreira PDA, čuva contract_hash + deposit_lamports            |
| `lock_deposit`       | tenant       | Tenant šalje SOL u PDA, state → DepositLocked                |
| `record_checkin`     | authority    | Čuva hash check-in slika, state → CheckinRecorded            |
| `record_checkout`    | authority    | Čuva hash check-out slika, state → CheckoutRecorded          |
| `execute_settlement` | authority    | Šalje SOL tanant-u i landlord-u po iznosima, state → Settled |

### Stati ugovora (AgreementState enum)

```
Created → DepositLocked → CheckinRecorded → CheckoutRecorded → Settled
```

Svaka instrukcija provjera tačan state — ako state nije ispravan, vraća `InvalidState` grešku.

### Račun (RentalAgreement)

```rust
pub struct RentalAgreement {
    pub contract_id: [u8; 32],      // UUID bez crtica (32 ASCII karaktera)
    pub contract_hash: [u8; 32],    // SHA-256 ugovora
    pub deposit_lamports: u64,
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub state: AgreementState,
    pub checkin_hash: [u8; 32],
    pub checkout_hash: [u8; 32],
    pub settlement_hash: [u8; 32],
    pub bump: u8,
}
// SIZE = 256 bajta (8 discriminator + 248 data)
```

### Greške

| Kod                  | Poruka                                  |
| -------------------- | --------------------------------------- |
| `InvalidState`       | Invalid state for this operation        |
| `SettlementMismatch` | Settlement amounts do not equal deposit |
| `Unauthorized`       | Unauthorized signer                     |

---

## TypeScript klijent (client/src/)

### ISolanaService interfejs

```typescript
// client/src/interface.ts — IZVOR ISTINE za interfejs
// Server ima kopiju u src/services/solana/ISolanaService.ts
// Ako se mijenja ovdje, mora se promijeniti i u serveru

export interface ISolanaService {
  findPDA(contractId: string): { pda: string; bump: number };
  initializeContract(
    contractId,
    contractHash,
    depositLamports,
    landlordPubkey,
  ): Promise<SolanaInitResult>;
  buildLockDepositTx(
    contractId,
    tenantPubkey,
  ): Promise<{ serialized_tx: string }>;
  recordCheckin(
    contractId,
    imageHash,
    landlordPubkey,
  ): Promise<{ tx_signature: string }>;
  recordCheckout(
    contractId,
    imageHash,
    tenantPubkey,
  ): Promise<{ tx_signature: string }>;
  executeSettlement(
    contractId,
    settlementHash,
    tenantAmount,
    landlordAmount,
    tenantPubkey,
    landlordPubkey,
  ): Promise<SolanaSettlementResult>;
  getAgreement(contractId): Promise<SolanaAgreement | null>;
  hashImages(imageHashes: string[]): Buffer;
  eurToLamports(eurAmount: number): number;
}
```

### SolanaService klasa

```typescript
import { SolanaService } from "@rentsmart/blockchain";

const solana = new SolanaService();
// Constructor čita env varijable: SOLANA_RPC_URL, SOLANA_PROGRAM_ID, SOLANA_AUTHORITY_KEYPAIR
```

### Primjeri korištenja

```typescript
// 1. Inicijalizacija ugovora (POST /contracts)
const contractHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(contractData))
  .digest();
const result = await solana.initializeContract(
  contractId,
  contractHash,
  depositLamports,
  landlordWallet,
);
// result.tx_signature, result.pda_address, result.explorer_url

// 2. Build lock_deposit transakcije za tenant potpis (POST /contracts/:id/accept)
const { serialized_tx } = await solana.buildLockDepositTx(
  contractId,
  tenantWallet,
);
// Pošalji serialized_tx mobilnoj aplikaciji — tenant potpisuje i broadcastuje

// 3. Zapis check-in hasha (POST /contracts/:id/checkin/approve)
const imageHash = solana.hashImages(imageHashArray);
const { tx_signature } = await solana.recordCheckin(
  contractId,
  imageHash,
  landlordWallet,
);

// 4. Zapis check-out hasha (POST /contracts/:id/checkout/approve)
const imageHash = solana.hashImages(imageHashArray);
const { tx_signature } = await solana.recordCheckout(
  contractId,
  imageHash,
  tenantWallet,
);

// 5. Izvršavanje settlement-a (POST /contracts/:id/settlement/approve — finalizacija)
const settlementHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(settlement))
  .digest();
const result = await solana.executeSettlement(
  contractId,
  settlementHash,
  tenantLamports,
  landlordLamports,
  tenantWallet,
  landlordWallet,
);

// 6. EUR → lamports konverzija
const lamports = solana.eurToLamports(800); // 800 EUR
```

### Graceful degradation

Sve Solana operacije u serveru treba omotati try/catch:

```typescript
let solanaTx: string | null = null;
try {
  const result = await solana.initializeContract(...);
  solanaTx = result.tx_signature;
} catch (err) {
  console.error('[Solana] initializeContract failed, continuing without blockchain:', err);
}
// Nastavi sa DB operacijom bez obzira
await db.query('UPDATE contracts SET solana_tx_init = $1 WHERE id = $2', [solanaTx, contractId]);
```

---

## Env varijable

```
SOLANA_RPC_URL              # https://api.devnet.solana.com (devnet) ili http://127.0.0.1:8899 (local)
SOLANA_PROGRAM_ID           # Base58 program ID (uzima se iz .env)
SOLANA_AUTHORITY_KEYPAIR    # JSON array bajtova: [1,2,3,...,64]
EUR_SOL_RATE                # Opciono: kurs EUR/SOL (default: 0.01 — konzervativno za devnet)
```

---

## Deploy na devnet

```bash
# 1. Build
anchor build

# 2. Deploy
anchor deploy --provider.cluster devnet
# Output: Program Id: <BASE58_ADDRESS>

# 3. Upiši ili osvježi jedino:
#    - .env → SOLANA_PROGRAM_ID=<ID>
#    Anchor.toml i Rust program čitaju vrijednost iz .env.

# 4. Provjeri deployment
solana program show <PROGRAM_ID> --url devnet
```

---

## Integracija sa serverom

Kada je blockchain modul spreman za integraciju:

### Korak 1: Provjeri package.json

Server već ima `@rentsmart/blockchain` kao optional dependency. U root direktorijumu:

```bash
npm install  # npm workspaces automatski linkuje app/blockchain kao @rentsmart/blockchain
```

### Korak 2: Postavi env varijable u serveru

```bash
# U app/server/.env
SOLANA_PROGRAM_ID=<tvoj_program_id>
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_AUTHORITY_KEYPAIR=[1,2,3,...,64]
```

### Korak 3: Verifikacija

Server factory u `src/services/solana/index.ts` automatski detektuje `SOLANA_PROGRAM_ID`:

- Ako je setovan → instancira pravu `SolanaService` iz `@rentsmart/blockchain`
- Ako nije setovan → koristi `MockSolanaService` (server radi bez blockchaina)

```bash
# Test integracije
curl -X POST http://localhost:3000/api/v1/contracts \
  -H "X-Mock-User: landlord_marko" \
  -H "Content-Type: application/json" \
  -d '{"property_address":"Test 1","rent_monthly_eur":400,"deposit_amount_eur":800,...}'
# U logs-u treba vidjeti: [Solana] initializeContract: <contract_id>
# A ne: [MockSolana] initializeContract: <contract_id>
```

### Korak 4: Provjeri solana explorer

```
https://explorer.solana.com/?cluster=devnet
# Upiši tx_signature iz response-a
```

---

## Testiranje

### Anchor testovi (tests/rentsmart.ts)

```bash
anchor test
```

Testovi pokrivaju:

- `initialize` — kreira PDA sa ispravnim podacima
- `lock_deposit` — tenant SOL se zaključava u PDA
- `record_checkin` — hash se zapisuje, state se mijenja
- `record_checkout` — hash se zapisuje, state se mijenja
- `execute_settlement` — SOL se ispravno raspodjeljuje

### Ručno testiranje klijenta

```typescript
// Iz app/blockchain/ direktoria, uz pokrenuti lokalni validator:
npx tsx -e "
  import { SolanaService } from './client/src';
  const s = new SolanaService();
  const pda = s.findPDA('550e8400-e29b-41d4-a716-446655440000');
  console.log(pda);
"
```

---

## Konvencije za kod

### Rust (programs/)

- Koristiti `anchor_lang::error_code!` za sve custom greške
- Sve `require!()` provjere na početku instrukcije function body-a
- Komentari na engleskom
- Ne stavljati biznis logiku u accounts struct-ove — samo validacije constraints
- Svaka instrukcija ima odgovarajući Accounts struct sa istim imenom
- Koristiti `pub const SIZE: usize` u svakom account struct-u

### TypeScript (client/)

- Sve metode `async`, čak i ako interno nisu
- Constructor čita env varijable i baca `Error` ako `SOLANA_PROGRAM_ID` nije setovan
- Sve Pubkey pretvorbe iz stringa unutar metoda, ne van klase
- `hashImages` i `eurToLamports` su instance metode (ne static) — interfejs to zahtijeva
- IDL se učitava sa `require('../../../target/idl/rentsmart.json')` — relativna putanja od `client/src/`

---

## Česte greške koje treba izbjeći

1. **Ne stavljaj lične podatke on-chain.** Samo hash-evi (SHA-256), iznosi lamports-a, Solana wallet adrese.
2. **Ne zaboravi `anchor build` prije `anchor test`.** Testovi koriste IDL — mora biti up to date.
3. **Ne hardkoduj program ID.** Uvijek iz env varijable (`SOLANA_PROGRAM_ID`) iz `.env`.
4. **Ne potpisuj `lock_deposit` sa authority.** Tu transakciju gradi server ali potpisuje tenant na svom mobilnom uređaju.
5. **Ne baršunaj lamports konverziju.** `eurToLamports()` koristi pravi kurs — provjeri `EUR_SOL_RATE` env varijablu. Na deventu za demo možeš hardkodovati, ali dokumentuj.
6. **Ne preskači state checks.** Svaka instrukcija mora `require!` tačan state — bez toga se može desiti replay.
7. **Ne zaboravi PDA bump.** `agreement.bump` se čuva u account-u i koristi za `seeds = [...], bump = agreement.bump` u mutable constraints.
8. **Ne koristiti `.unwrap()` u Rustu.** Koristiti `?` operator ili explicitni `require!`.
9. **IDL fajl.** Tek nakon `anchor build`, IDL postoji u `target/idl/rentsmart.json`. Klijent ne radi bez njega — commituj IDL ili buildy-aj pre testa.
10. **Devnet ograničenja.** Besplatni airdrop je 2 SOL. Za testiranje settlement-a potreban je SOL u PDA — ne testirati sa 0-SOL ugovorima.

---

## Interfejs kontrakt sa serverom

Server u `app/server/src/services/solana/ISolanaService.ts` sadrži kopiju `ISolanaService` interfejsa. Ovi fajlovi moraju ostati u sinku:

| Fajl u blockchain modulu  | Odgovarajući fajl u serveru             |
| ------------------------- | --------------------------------------- |
| `client/src/interface.ts` | `src/services/solana/ISolanaService.ts` |

**Izvor istine:** `client/src/interface.ts` u blockchain modulu (jer blockchain implementira interfejs).

Ako dodaješ novu metodu u `SolanaService`:

1. Dodaj je u `client/src/interface.ts`
2. Implementiraj je u `client/src/solanaService.ts`
3. Obavijesti server developera da doda isti potpis u `src/services/solana/ISolanaService.ts`
4. Dodaj stub u `MockSolanaService.ts` na serveru

---

## Solana Devnet resursi

- Explorer: `https://explorer.solana.com/?cluster=devnet`
- Faucet: `solana airdrop 2 <WALLET_ADDRESS> --url devnet`
- Anchor docs: `https://www.anchor-lang.com/docs`
- @coral-xyz/anchor API: `https://coral-xyz.github.io/anchor/ts/`
