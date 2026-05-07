// Glob re-export so the auto-generated __client_accounts_* modules emitted
// by #[derive(Accounts)] are reachable as crate::<name> — Anchor's #[program]
// macro requires that path. Each file's `handler` fn is pub(crate) so it
// does not collide across modules.

pub mod accept_and_settle;
pub mod admin;
pub mod cancel_intent;
pub mod cancel_response;
pub mod post_intent;
pub mod post_response;

pub use accept_and_settle::*;
pub use admin::*;
pub use cancel_intent::*;
pub use cancel_response::*;
pub use post_intent::*;
pub use post_response::*;
