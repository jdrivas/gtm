use std::path::PathBuf;
use serde::Deserialize;

/// All configuration for the GTM application.
///
/// Precedence (lowest to highest): defaults → config file → env var → CLI arg.
/// CLI arg merging is done by the caller after `Config::load()`.
#[derive(Debug, Clone)]
pub struct Config {
    // Database
    pub db_url: String,

    // Server
    pub port: u16,

    // Logging
    pub log_level: String,
    pub utc: bool,

    // Auth0
    pub auth0_domain: String,
    pub auth0_audience: String,

}

/// Config file layout (~/.gtm/config.toml). All fields optional — they layer
/// on top of compiled-in defaults.
#[derive(Debug, Deserialize, Default)]
struct FileConfig {
    db_url: Option<String>,
    port: Option<u16>,
    log_level: Option<String>,
    utc: Option<bool>,
    auth0_domain: Option<String>,
    auth0_audience: Option<String>,
}

impl Config {
    /// Config directory: ~/.gtm/
    pub fn dir() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".gtm")
    }

    /// Config file path: ~/.gtm/config.toml
    pub fn file_path() -> PathBuf {
        Self::dir().join("config.toml")
    }

    /// Load config: defaults → config file → env vars.
    /// CLI args should be merged by the caller afterward.
    pub fn load() -> Self {
        let mut config = Self::defaults();

        // Layer 2: config file
        if let Ok(contents) = std::fs::read_to_string(Self::file_path()) {
            if let Ok(file) = toml::from_str::<FileConfig>(&contents) {
                config.apply_file(file);
            }
        }

        // Layer 3: environment variables
        config.apply_env();

        config
    }

    // --- Private helpers ---

    fn defaults() -> Self {
        Self {
            db_url: "sqlite:gtm.db".to_string(),
            port: 3000,
            log_level: "info".to_string(),
            utc: false,
            auth0_domain: "momentlabs.auth0.com".to_string(),
            auth0_audience: "https://gtm-api.momentlabs.io".to_string(),
        }
    }

    fn apply_file(&mut self, file: FileConfig) {
        if let Some(v) = file.db_url { self.db_url = v; }
        if let Some(v) = file.port { self.port = v; }
        if let Some(v) = file.log_level { self.log_level = v; }
        if let Some(v) = file.utc { self.utc = v; }
        if let Some(v) = file.auth0_domain { self.auth0_domain = v; }
        if let Some(v) = file.auth0_audience { self.auth0_audience = v; }
    }

    fn apply_env(&mut self) {
        if let Ok(v) = std::env::var("GTM_DB_URL") { self.db_url = v; }
        if let Ok(v) = std::env::var("GTM_PORT") {
            if let Ok(p) = v.parse() { self.port = p; }
        }
        if let Ok(v) = std::env::var("GTM_LOG_LEVEL") { self.log_level = v; }
        if let Ok(v) = std::env::var("GTM_UTC") {
            self.utc = v == "1" || v.eq_ignore_ascii_case("true");
        }
        if let Ok(v) = std::env::var("AUTH0_DOMAIN") { self.auth0_domain = v; }
        if let Ok(v) = std::env::var("AUTH0_AUDIENCE") { self.auth0_audience = v; }
    }
}
