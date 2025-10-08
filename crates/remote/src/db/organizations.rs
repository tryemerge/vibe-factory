use chrono::{DateTime, Utc};
use uuid::Uuid;

struct Organization {
    id: Uuid,
    name: String,
    slug: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
