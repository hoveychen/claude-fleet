fn main() {
    let title = std::env::var("FLEET_USER_TITLE").unwrap_or_default();
    let locale = std::env::var("FLEET_LOCALE").unwrap_or_else(|_| "zh".to_string());
    claw_fleet_core::interaction_mode::apply_interaction_mode(&title, &locale)
        .expect("apply_interaction_mode");
    println!("refreshed with title={title:?} locale={locale:?}");
}
