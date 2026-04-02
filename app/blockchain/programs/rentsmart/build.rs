use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=../../.env");
    println!("cargo:rerun-if-changed=build.rs");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let env_file = manifest_dir.join("../../.env");
    let contents = fs::read_to_string(&env_file)
        .unwrap_or_else(|_| panic!("Failed to read SOLANA_PROGRAM_ID from {}", env_file.display()));

    let program_id = contents
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .find_map(|line| line.strip_prefix("SOLANA_PROGRAM_ID=").map(str::trim))
        .unwrap_or_else(|| panic!("SOLANA_PROGRAM_ID not found in {}", env_file.display()));

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR missing"));
    let generated = format!("declare_id!(\"{program_id}\");\n");
    fs::write(out_dir.join("program_id.rs"), generated)
        .unwrap_or_else(|_| panic!("Failed to write generated program_id.rs"));
}