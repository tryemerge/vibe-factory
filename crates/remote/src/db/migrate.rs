use sqlx::{PgPool, migrate::MigrateError};

pub async fn run(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
