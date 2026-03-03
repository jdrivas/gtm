use std::process::Command;

fn main() {
    // Prefer GTM_GIT_HASH env var (set by Docker --build-arg), fall back to git
    let hash = std::env::var("GTM_GIT_HASH")
        .ok()
        .filter(|v| !v.is_empty() && v != "unknown");

    let git_hash = if let Some(h) = hash {
        h
    } else {
        let short = Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "unknown".to_string());

        // Check if working tree is dirty
        let dirty = Command::new("git")
            .args(["status", "--porcelain"])
            .output()
            .ok()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);

        if dirty {
            format!("{short}-dirty")
        } else {
            short
        }
    };

    println!("cargo:rustc-env=GTM_GIT_HASH={git_hash}");
    println!("cargo:rerun-if-changed=../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../.git/index");
    println!("cargo:rerun-if-env-changed=GTM_GIT_HASH");
}
