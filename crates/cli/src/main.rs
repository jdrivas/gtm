use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "giants-cli")]
#[command(about = "SF Giants Ticket Manager CLI")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Display a hello world message
    Hello,
    /// Scrape the Giants schedule from the MLB Stats API
    ScrapeSchedule,
    /// List upcoming games
    ListGames {
        /// Filter by month (1-12)
        #[arg(long)]
        month: Option<u32>,
    },
    /// List ticket inventory
    ListTickets,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Hello => {
            println!("Hello, Giants! 🏟️");
        }
        Commands::ScrapeSchedule => {
            println!("Schedule scraping not yet implemented (Phase 2b)");
        }
        Commands::ListGames { month } => {
            match month {
                Some(m) => println!("Listing games for month {m} (not yet implemented — Phase 2a)"),
                None => println!("Listing all games (not yet implemented — Phase 2a)"),
            }
        }
        Commands::ListTickets => {
            println!("Ticket listing not yet implemented (Phase 2c)");
        }
    }

    Ok(())
}
