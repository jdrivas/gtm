mod common;

use common::{sample_game, test_pool};

// --- Request Lifecycle ---

#[tokio::test]
async fn request_lifecycle_create_withdraw_recreate() {
    let pool = test_pool().await;
    let game = sample_game(500001);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|lc1", "lc@example.com", "Lifecycle")
        .await
        .unwrap();

    // Create
    let req = gtm_db::create_ticket_request(&pool, user.id, 500001, 2, None)
        .await
        .unwrap();
    assert_eq!(req.status, "pending");

    // Withdraw
    let ok = gtm_db::withdraw_ticket_request(&pool, req.id, user.id)
        .await
        .unwrap();
    assert!(ok);

    // Verify withdrawn
    let reqs = gtm_db::list_requests_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(reqs[0].status, "withdrawn");

    // Re-request recycles the withdrawn row back to pending
    let req2 = gtm_db::create_ticket_request(&pool, user.id, 500001, 4, None)
        .await
        .unwrap();
    assert_eq!(req2.id, req.id); // same row reused
    assert_eq!(req2.status, "pending");
    assert_eq!(req2.seats_requested, 4);
}

// --- Ticket Assignment ---

#[tokio::test]
async fn generate_and_assign_tickets() {
    let pool = test_pool().await;
    let game = sample_game(500002);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "A", "1", None)
        .await
        .unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|assign1", "a@example.com", "Assignee")
        .await
        .unwrap();

    // Generate tickets
    let count = gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();
    assert_eq!(count, 1); // one home game

    // List tickets for game
    let tickets = gtm_db::list_tickets_for_game(&pool, 500002)
        .await
        .unwrap();
    assert_eq!(tickets.len(), 1);
    assert_eq!(tickets[0].status, "available");
    assert!(tickets[0].assigned_to.is_none());

    // Assign
    let ok = gtm_db::assign_ticket(&pool, tickets[0].id, user.id)
        .await
        .unwrap();
    assert!(ok);

    // Verify assigned
    let tickets = gtm_db::list_tickets_for_game(&pool, 500002)
        .await
        .unwrap();
    assert_eq!(tickets[0].status, "assigned");
    assert_eq!(tickets[0].assigned_to, Some(user.id));

    // User's tickets
    let my_tickets = gtm_db::list_tickets_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(my_tickets.len(), 1);
}

// --- Release + Withdraw ---

#[tokio::test]
async fn release_tickets_also_withdraws_request() {
    let pool = test_pool().await;
    let game = sample_game(500003);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "B", "1", None)
        .await
        .unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|rel1", "r@example.com", "Releaser")
        .await
        .unwrap();

    // Create request and assign ticket
    let req = gtm_db::create_ticket_request(&pool, user.id, 500003, 1, None)
        .await
        .unwrap();
    gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();
    let tickets = gtm_db::list_tickets_for_game(&pool, 500003)
        .await
        .unwrap();
    gtm_db::assign_ticket(&pool, tickets[0].id, user.id)
        .await
        .unwrap();

    // Approve the request
    gtm_db::update_request_approval(&pool, req.id, 1, "approved")
        .await
        .unwrap();

    // Release tickets
    let released = gtm_db::release_tickets_for_game(&pool, 500003, user.id)
        .await
        .unwrap();
    assert_eq!(released, 1);

    // Ticket is available again
    let tickets = gtm_db::list_tickets_for_game(&pool, 500003)
        .await
        .unwrap();
    assert_eq!(tickets[0].status, "available");
    assert!(tickets[0].assigned_to.is_none());

    // Request is withdrawn
    let reqs = gtm_db::list_requests_for_user(&pool, user.id)
        .await
        .unwrap();
    assert_eq!(reqs[0].status, "withdrawn");
}

// --- Revoke Ticket ---

#[tokio::test]
async fn revoke_ticket_makes_available() {
    let pool = test_pool().await;
    let game = sample_game(500004);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "C", "1", None)
        .await
        .unwrap();
    let user = gtm_db::upsert_user(&pool, "auth0|rev1", "v@example.com", "Revoker")
        .await
        .unwrap();

    gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();
    let tickets = gtm_db::list_tickets_for_game(&pool, 500004)
        .await
        .unwrap();
    gtm_db::assign_ticket(&pool, tickets[0].id, user.id)
        .await
        .unwrap();

    let ok = gtm_db::revoke_ticket(&pool, tickets[0].id).await.unwrap();
    assert!(ok);

    let tickets = gtm_db::list_tickets_for_game(&pool, 500004)
        .await
        .unwrap();
    assert_eq!(tickets[0].status, "available");
    assert!(tickets[0].assigned_to.is_none());
}

// --- Allocation Summary ---

#[tokio::test]
async fn allocation_summary_counts() {
    let pool = test_pool().await;
    let game = sample_game(500005);
    gtm_db::upsert_game(&pool, &game).await.unwrap();

    // Add 2 seats
    let s1 = gtm_db::add_seat(&pool, "VR313", "D", "1", None)
        .await
        .unwrap();
    let s2 = gtm_db::add_seat(&pool, "VR313", "D", "2", None)
        .await
        .unwrap();
    gtm_db::generate_tickets_for_seat(&pool, s1.id)
        .await
        .unwrap();
    gtm_db::generate_tickets_for_seat(&pool, s2.id)
        .await
        .unwrap();

    // Create a request for 3 seats
    let user = gtm_db::upsert_user(&pool, "auth0|sum1", "s@example.com", "Summer")
        .await
        .unwrap();
    gtm_db::create_ticket_request(&pool, user.id, 500005, 3, None)
        .await
        .unwrap();

    // Assign one ticket
    let tickets = gtm_db::list_tickets_for_game(&pool, 500005)
        .await
        .unwrap();
    gtm_db::assign_ticket(&pool, tickets[0].id, user.id)
        .await
        .unwrap();

    let summary = gtm_db::allocation_summary(&pool).await.unwrap();
    assert_eq!(summary.len(), 1);
    let (game_pk, total, assigned, available, requested) = summary[0];
    assert_eq!(game_pk, 500005);
    assert_eq!(total, 2);
    assert_eq!(assigned, 1);
    assert_eq!(available, 1);
    assert_eq!(requested, 3);
}

// --- Ticket Summary ---

#[tokio::test]
async fn ticket_summary_per_game() {
    let pool = test_pool().await;
    let game = sample_game(500006);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    let seat = gtm_db::add_seat(&pool, "VR313", "E", "1", None)
        .await
        .unwrap();
    gtm_db::generate_tickets_for_seat(&pool, seat.id)
        .await
        .unwrap();

    let summary = gtm_db::ticket_summary_for_games(&pool).await.unwrap();
    assert_eq!(summary.len(), 1);
    let (game_pk, total, available) = summary[0];
    assert_eq!(game_pk, 500006);
    assert_eq!(total, 1);
    assert_eq!(available, 1);
}

// --- Generate Tickets For All Seats ---

#[tokio::test]
async fn generate_tickets_for_all_seats() {
    let pool = test_pool().await;
    let game = sample_game(500007);
    gtm_db::upsert_game(&pool, &game).await.unwrap();
    gtm_db::add_seat(&pool, "VR313", "F", "1", None)
        .await
        .unwrap();
    gtm_db::add_seat(&pool, "VR313", "F", "2", None)
        .await
        .unwrap();

    let count = gtm_db::generate_tickets_for_all_seats(&pool)
        .await
        .unwrap();
    assert_eq!(count, 2); // 1 game × 2 seats

    let tickets = gtm_db::list_tickets_for_game(&pool, 500007)
        .await
        .unwrap();
    assert_eq!(tickets.len(), 2);
}
