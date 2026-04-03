mod common;

use common::{sample_game, test_pool};
use gtm_models::Promotion;

// --- Games ---

#[tokio::test]
async fn upsert_and_list_games() {
    let pool = test_pool().await;
    let game = sample_game(100001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    let games = gtm_db::list_games(&pool, None).await.unwrap();
    assert_eq!(games.len(), 1);
    assert_eq!(games[0].game_pk, 100001);
    assert_eq!(games[0].away_team_name, "Arizona Diamondbacks");
}

#[tokio::test]
async fn get_game_by_pk() {
    let pool = test_pool().await;
    let game = sample_game(100002);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    let found = gtm_db::get_game(&pool, 100002).await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().venue_name, "Oracle Park");

    let missing = gtm_db::get_game(&pool, 999999).await.unwrap();
    assert!(missing.is_none());
}

#[tokio::test]
async fn upsert_game_updates_existing() {
    let pool = test_pool().await;
    let mut game = sample_game(100003);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    game.status_detailed = "Final".to_string();
    game.home_score = Some(5);
    game.away_score = Some(3);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    let found = gtm_db::get_game(&pool, 100003).await.unwrap().unwrap();
    assert_eq!(found.status_detailed, "Final");
    assert_eq!(found.home_score, Some(5));
    assert_eq!(found.away_score, Some(3));

    // Should still be one game, not two
    let games = gtm_db::list_games(&pool, None).await.unwrap();
    assert_eq!(games.len(), 1);
}

// --- Users ---

#[tokio::test]
async fn upsert_and_list_users() {
    let pool = test_pool().await;
    let user = gtm_db::upsert_user(&pool, "auth0|abc123", "alice@example.com", "Alice")
        .await
        .unwrap();
    assert_eq!(user.email, "alice@example.com");
    assert_eq!(user.name, "Alice");

    let users = gtm_db::list_users(&pool).await.unwrap();
    assert_eq!(users.len(), 1);
}

#[tokio::test]
async fn get_user_by_sub() {
    let pool = test_pool().await;
    gtm_db::upsert_user(&pool, "auth0|xyz789", "bob@example.com", "Bob")
        .await
        .unwrap();

    let found = gtm_db::get_user_by_sub(&pool, "auth0|xyz789")
        .await
        .unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "Bob");

    let missing = gtm_db::get_user_by_sub(&pool, "auth0|nope").await.unwrap();
    assert!(missing.is_none());
}

#[tokio::test]
async fn upsert_user_updates_existing() {
    let pool = test_pool().await;
    let user1 = gtm_db::upsert_user(&pool, "auth0|u1", "old@example.com", "Old Name")
        .await
        .unwrap();

    let user2 = gtm_db::upsert_user(&pool, "auth0|u1", "new@example.com", "New Name")
        .await
        .unwrap();

    assert_eq!(user1.id, user2.id); // same row
    assert_eq!(user2.email, "new@example.com");
    assert_eq!(user2.name, "New Name");

    let users = gtm_db::list_users(&pool).await.unwrap();
    assert_eq!(users.len(), 1);
}

// --- Seats ---

#[tokio::test]
async fn add_and_list_seats() {
    let pool = test_pool().await;
    let seat = gtm_db::add_seat(&pool, "VR313", "A", "1", Some("aisle"))
        .await
        .unwrap();
    assert_eq!(seat.section, "VR313");
    assert_eq!(seat.row, "A");
    assert_eq!(seat.seat, "1");
    assert_eq!(seat.notes.as_deref(), Some("aisle"));

    let seats = gtm_db::list_seats(&pool).await.unwrap();
    assert_eq!(seats.len(), 1);
}

#[tokio::test]
async fn delete_seat() {
    let pool = test_pool().await;
    let seat = gtm_db::add_seat(&pool, "VR313", "A", "2", None)
        .await
        .unwrap();

    let deleted = gtm_db::delete_seat(&pool, seat.id).await.unwrap();
    assert!(deleted);

    let seats = gtm_db::list_seats(&pool).await.unwrap();
    assert!(seats.is_empty());

    // Deleting again returns false
    let deleted_again = gtm_db::delete_seat(&pool, seat.id).await.unwrap();
    assert!(!deleted_again);
}

// --- Ticket Requests ---

#[tokio::test]
async fn create_and_list_ticket_requests() {
    let pool = test_pool().await;
    let game = sample_game(200001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|req1", "req@example.com", "Requester")
        .await
        .unwrap();

    let req = gtm_db::create_ticket_request(&pool, user.id, 200001, 2, Some("please"))
        .await
        .unwrap();
    assert_eq!(req.game_pk, 200001);
    assert_eq!(req.seats_requested, 2);
    assert_eq!(req.status, "pending");
    assert_eq!(req.notes.as_deref(), Some("please"));

    let reqs = gtm_db::list_requests_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0].id, req.id);
}

// --- Game Tags ---

#[tokio::test]
async fn upsert_and_list_game_tags() {
    let pool = test_pool().await;
    let game = sample_game(300001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|tag1", "tag@example.com", "Tagger")
        .await
        .unwrap();

    // Set shortlist
    gtm_db::upsert_game_tag(&pool, user.id, 300001, true, false)
        .await
        .unwrap();
    let tags = gtm_db::list_game_tags_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].shortlist, 1);
    assert_eq!(tags[0].cant_go, 0);

    // Toggle to can't go
    gtm_db::upsert_game_tag(&pool, user.id, 300001, false, true)
        .await
        .unwrap();
    let tags = gtm_db::list_game_tags_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].shortlist, 0);
    assert_eq!(tags[0].cant_go, 1);

    // Both false deletes the row
    gtm_db::upsert_game_tag(&pool, user.id, 300001, false, false)
        .await
        .unwrap();
    let tags = gtm_db::list_game_tags_for_user(&pool, user.id)
        .await
        .unwrap();
    assert!(tags.is_empty());
}

// --- Promotions ---

#[tokio::test]
async fn upsert_and_get_promotions() {
    let pool = test_pool().await;
    let game = sample_game(400001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    let promo = Promotion {
        offer_id: 1,
        game_pk: 400001,
        name: "Bobblehead Night".to_string(),
        offer_type: Some("Giveaway".to_string()),
        description: Some("First 20,000 fans".to_string()),
        distribution: None,
        presented_by: None,
        alt_page_url: None,
        ticket_link: None,
        thumbnail_url: None,
        image_url: None,
        display_order: 1,
    };
    gtm_db::upsert_promotion(&pool, &promo).await.unwrap();

    let promos = gtm_db::get_promotions_for_game(&pool, 400001)
        .await
        .unwrap();
    assert_eq!(promos.len(), 1);
    assert_eq!(promos[0].name, "Bobblehead Night");

    // Upsert update
    let updated_promo = Promotion {
        name: "Updated Bobblehead Night".to_string(),
        ..promo
    };
    gtm_db::upsert_promotion(&pool, &updated_promo)
        .await
        .unwrap();
    let promos = gtm_db::get_promotions_for_game(&pool, 400001)
        .await
        .unwrap();
    assert_eq!(promos.len(), 1);
    assert_eq!(promos[0].name, "Updated Bobblehead Night");
}
