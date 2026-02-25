use axum::{Router, routing::get, Json};
use serde_json::json;
use tower_http::services::ServeDir;
use tracing_subscriber;

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "message": "Hello, Giants!"
    }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let api_routes = Router::new().route("/health", get(health));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new("frontend/dist"));

    let addr = "0.0.0.0:3000";
    println!("🏟️  Giants Ticket Manager listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
