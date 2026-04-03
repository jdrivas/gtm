mod common;

use common::{sample_game, test_pool};

// --- pg() helper ---

#[test]
fn pg_translates_placeholders_when_sqlite() {
    // When IS_POSTGRES is not set (or false, as in SQLite tests),
    // pg() should return the SQL unchanged.
    let sql = "SELECT * FROM games WHERE game_pk = ? AND season = ?";
    let result = gtm_db::pg(sql);
    assert_eq!(result, sql);
}

// --- Assign already-assigned ticket ---

#[tokio::test]
async fn assign_already_assigned_returns_false() {
    let pool = test_pool().await;
    let game = sample_game(600001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "G", "1", None)
        .await
        .unwrap();
    let user1 = gtm_db::upsert_user(&pool, "auth0|c1", "c1@example.com", "User1")
        .await
        .unwrap();
    let user2 = gtm_db::upsert_user(&pool, "auth0|c2", "c2@example.com", "User2")
        .await
        .unwrap();

    gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();
    let tickets = gtm_db::list_tickets_for_game(&pool, 600001)
        .await
        .unwrap();

    // First assign succeeds
    let ok = gtm_db::assign_ticket(&pool, tickets[0].id, user1.id)
        .await
        .unwrap();
    assert!(ok);

    // Second assign to different user fails (ticket not available)
    let ok = gtm_db::assign_ticket(&pool, tickets[0].id, user2.id)
        .await
        .unwrap();
    assert!(!ok);
}

// --- Withdraw non-pending request ---

#[tokio::test]
async fn withdraw_non_pending_returns_false() {
    let pool = test_pool().await;
    let game = sample_game(600002);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|c3", "c3@example.com", "User3")
        .await
        .unwrap();

    let req = gtm_db::create_ticket_request(&pool, user.id, 600002, 2, None)
        .await
        .unwrap();

    // Withdraw once — succeeds
    let ok = gtm_db::withdraw_ticket_request(&pool, req.id, user.id)
        .await
        .unwrap();
    assert!(ok);

    // Withdraw again — already withdrawn, returns false
    let ok = gtm_db::withdraw_ticket_request(&pool, req.id, user.id)
        .await
        .unwrap();
    assert!(!ok);
}

// --- Revoke non-assigned ticket ---

#[tokio::test]
async fn revoke_available_ticket_returns_false() {
    let pool = test_pool().await;
    let game = sample_game(600003);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "H", "1", None)
        .await
        .unwrap();

    gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();
    let tickets = gtm_db::list_tickets_for_game(&pool, 600003)
        .await
        .unwrap();

    // Ticket is available, not assigned — revoke should return false
    let ok = gtm_db::revoke_ticket(&pool, tickets[0].id).await.unwrap();
    assert!(!ok);
}

// --- Duplicate request upserts, not errors ---

#[tokio::test]
async fn duplicate_request_upserts() {
    let pool = test_pool().await;
    let game = sample_game(600004);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|c4", "c4@example.com", "User4")
        .await
        .unwrap();

    let req1 = gtm_db::create_ticket_request(&pool, user.id, 600004, 2, None)
        .await
        .unwrap();
    let req2 = gtm_db::create_ticket_request(&pool, user.id, 600004, 4, Some("updated"))
        .await
        .unwrap();

    // Same row, updated fields
    assert_eq!(req1.id, req2.id);
    assert_eq!(req2.seats_requested, 4);

    // Only one request exists
    let reqs = gtm_db::list_requests_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(reqs.len(), 1);
}

// --- Update request for wrong user ---

#[tokio::test]
async fn update_request_wrong_user_returns_false() {
    let pool = test_pool().await;
    let game = sample_game(600005);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user1 = gtm_db::upsert_user(&pool, "auth0|c5", "c5@example.com", "User5")
        .await
        .unwrap();
    let user2 = gtm_db::upsert_user(&pool, "auth0|c6", "c6@example.com", "User6")
        .await
        .unwrap();

    let req = gtm_db::create_ticket_request(&pool, user1.id, 600005, 2, None)
        .await
        .unwrap();

    // User2 trying to update User1's request should fail
    let ok = gtm_db::update_ticket_request(&pool, req.id, user2.id, 4)
        .await
        .unwrap();
    assert!(!ok);

    // User1 can update their own
    let ok = gtm_db::update_ticket_request(&pool, req.id, user1.id, 4)
        .await
        .unwrap();
    assert!(ok);
}
