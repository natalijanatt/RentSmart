import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  MOCK_AUTH: z.coerce.boolean().default(false),
  MOCK_LLM: z.coerce.boolean().default(false),
  // Blockchain — mandatory
  SOLANA_PROGRAM_ID: z.string().min(1, 'SOLANA_PROGRAM_ID is required'),
  SOLANA_AUTHORITY_KEYPAIR: z.string().min(1, 'SOLANA_AUTHORITY_KEYPAIR is required'),
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  PLATFORM_SOLANA_PUBKEY: z.string().min(32, 'PLATFORM_SOLANA_PUBKEY is required (base58 Solana address)'),
  EUR_SOL_RATE: z.coerce.number().positive().default(0.01),
  // Required only when MOCK_AUTH=false
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  // Required only when MOCK_LLM=false
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-nano-12b-v2-vl:free'),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Invalid environment variables:');
  for (const issue of result.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
