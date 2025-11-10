//! Workflow Orchestrator Unit Tests
//!
//! These tests verify the core logic of the workflow orchestrator without requiring
//! full container integration. Integration tests are handled elsewhere.

use db::{
    DBService,
    models::{
        agent::{Agent, CreateAgent},
        project::{CreateProject, Project},
        station_execution::{CreateStationExecution, StationExecution},
        station_transition::{CreateStationTransition, StationTransition},
        task::{CreateTask, Task},
        task_attempt::{CreateTaskAttempt, TaskAttempt},
        workflow::{CreateWorkflow, Workflow},
        workflow_execution::{CreateWorkflowExecution, WorkflowExecution},
        workflow_station::{CreateWorkflowStation, WorkflowStation},
    },
};
use executors::executors::BaseCodingAgent;
use services::services::workflow_orchestrator::{
    WorkflowOrchestrator, WorkflowOrchestratorError,
};
use sqlx::SqlitePool;
use uuid::Uuid;

// ============================================================================
// TEST SETUP UTILITIES
// ============================================================================

async fn create_test_project(pool: &SqlitePool) -> Result<Project, Box<dyn std::error::Error>> {
    let project_id = Uuid::new_v4();
    let temp_dir = tempfile::tempdir()?;
    let project = Project::create(
        pool,
        &CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: temp_dir.path().to_string_lossy().to_string(),
            use_existing_repo: false,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
            worktree_dir: None,
        },
        project_id,
    )
    .await?;
    Ok(project)
}

async fn create_test_agent(pool: &SqlitePool) -> Result<Agent, Box<dyn std::error::Error>> {
    let agent_id = Uuid::new_v4();
    let agent = Agent::create(
        pool,
        CreateAgent {
            name: "Test Agent".to_string(),
            role: "test".to_string(),
            system_prompt: "You are a test agent.".to_string(),
            capabilities: None,
            tools: None,
            description: None,
            context_files: None,
            executor: Some("CLAUDE_CODE".to_string()),
        },
        agent_id,
    )
    .await?;
    Ok(agent)
}

async fn create_test_task(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Task, Box<dyn std::error::Error>> {
    let task_id = Uuid::new_v4();
    let task = Task::create(
        pool,
        &CreateTask {
            project_id,
            title: "Test Task".to_string(),
            description: Some("Test task for workflow execution".to_string()),
            parent_task_attempt: None,
            agent_id: None,
            workflow_id: None,
            image_ids: None,
        },
        task_id,
    )
    .await?;
    Ok(task)
}

async fn create_test_task_attempt(
    pool: &SqlitePool,
    task_id: Uuid,
) -> Result<TaskAttempt, Box<dyn std::error::Error>> {
    let attempt_id = Uuid::new_v4();
    let task_attempt = TaskAttempt::create(
        pool,
        &CreateTaskAttempt {
            executor: BaseCodingAgent::ClaudeCode,
            base_branch: "main".to_string(),
            branch: "test-branch".to_string(),
        },
        attempt_id,
        task_id,
    )
    .await?;
    Ok(task_attempt)
}

// ============================================================================
// TRANSITION EVALUATION TESTS
// ============================================================================

#[sqlx::test(migrations = "../db/migrations")]
async fn test_transition_always_succeeds(pool: SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;
    let agent = create_test_agent(&pool).await?;
    let task = create_test_task(&pool, project.id).await?;
    let task_attempt = create_test_task_attempt(&pool, task.id).await?;

    // Create workflow
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Test Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    // Create two stations
    let station1_id = Uuid::new_v4();
    let station1 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 1".to_string(),
            position: 0,
            description: None,
            x_position: Some(100.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: Some("Test prompt".to_string()),
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station1_id,
    )
    .await?;

    let station2_id = Uuid::new_v4();
    let _station2 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 2".to_string(),
            position: 1,
            description: None,
            x_position: Some(300.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: Some("Test prompt 2".to_string()),
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station2_id,
    )
    .await?;

    // Create transition with "always" condition
    let transition_id = Uuid::new_v4();
    let _transition = StationTransition::create(
        &pool,
        CreateStationTransition {
            workflow_id: workflow.id,
            source_station_id: station1.id,
            target_station_id: station2_id,
            condition: None,
            label: Some("Always".to_string()),
            condition_type: Some("always".to_string()),
            condition_value: None,
        },
        transition_id,
    )
    .await?;

    // Create workflow execution
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        &pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: task.id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // Create station execution
    let station_execution_id = Uuid::new_v4();
    let station_execution = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station1.id,
            status: "completed".to_string(),
            execution_process_id: None,
        },
        station_execution_id,
    )
    .await?;

    // Test transition evaluation
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let next_station = orchestrator
        .advance_to_next_station(
            workflow_execution.id,
            station1.id,
            &station_execution,
        )
        .await?;

    assert_eq!(next_station, Some(station2_id));

    Ok(())
}

#[sqlx::test(migrations = "../db/migrations")]
async fn test_transition_success_condition_with_completed_station(
    pool: SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;
    let agent = create_test_agent(&pool).await?;
    let task = create_test_task(&pool, project.id).await?;
    let task_attempt = create_test_task_attempt(&pool, task.id).await?;

    // Create workflow with stations
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Test Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    let station1_id = Uuid::new_v4();
    let station1 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 1".to_string(),
            position: 0,
            description: None,
            x_position: Some(100.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station1_id,
    )
    .await?;

    let station2_id = Uuid::new_v4();
    let _station2 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 2".to_string(),
            position: 1,
            description: None,
            x_position: Some(300.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station2_id,
    )
    .await?;

    // Create transition with "success" condition
    let transition_id = Uuid::new_v4();
    let _transition = StationTransition::create(
        &pool,
        CreateStationTransition {
            workflow_id: workflow.id,
            source_station_id: station1.id,
            target_station_id: station2_id,
            condition: None,
            label: Some("On Success".to_string()),
            condition_type: Some("success".to_string()),
            condition_value: None,
        },
        transition_id,
    )
    .await?;

    // Create workflow execution
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        &pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: task.id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // Create COMPLETED station execution
    let station_execution_id = Uuid::new_v4();
    let station_execution = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station1.id,
            status: "completed".to_string(),
            execution_process_id: None,
        },
        station_execution_id,
    )
    .await?;

    // Test: completed station should match "success" condition
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let next_station = orchestrator
        .advance_to_next_station(
            workflow_execution.id,
            station1.id,
            &station_execution,
        )
        .await?;

    assert_eq!(next_station, Some(station2_id));

    Ok(())
}

#[sqlx::test(migrations = "../db/migrations")]
async fn test_transition_success_condition_with_failed_station(
    pool: SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;
    let agent = create_test_agent(&pool).await?;
    let task = create_test_task(&pool, project.id).await?;
    let task_attempt = create_test_task_attempt(&pool, task.id).await?;

    // Create workflow
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Test Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    let station1_id = Uuid::new_v4();
    let station1 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 1".to_string(),
            position: 0,
            description: None,
            x_position: Some(100.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station1_id,
    )
    .await?;

    let station2_id = Uuid::new_v4();
    let _station2 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 2".to_string(),
            position: 1,
            description: None,
            x_position: Some(300.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station2_id,
    )
    .await?;

    // Create transition with "success" condition
    let transition_id = Uuid::new_v4();
    let _transition = StationTransition::create(
        &pool,
        CreateStationTransition {
            workflow_id: workflow.id,
            source_station_id: station1.id,
            target_station_id: station2_id,
            condition: None,
            label: Some("On Success".to_string()),
            condition_type: Some("success".to_string()),
            condition_value: None,
        },
        transition_id,
    )
    .await?;

    // Create workflow execution
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        &pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: task.id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // Create FAILED station execution
    let station_execution_id = Uuid::new_v4();
    let station_execution = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station1.id,
            status: "failed".to_string(),
            execution_process_id: None,
        },
        station_execution_id,
    )
    .await?;

    // Test: failed station should NOT match "success" condition
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let result = orchestrator
        .advance_to_next_station(
            workflow_execution.id,
            station1.id,
            &station_execution,
        )
        .await;

    // Should fail with NoValidTransition error
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        WorkflowOrchestratorError::NoValidTransition(_)
    ));

    Ok(())
}

#[sqlx::test(migrations = "../db/migrations")]
async fn test_conditional_transition_evaluation(
    pool: SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;
    let agent = create_test_agent(&pool).await?;
    let task = create_test_task(&pool, project.id).await?;
    let task_attempt = create_test_task_attempt(&pool, task.id).await?;

    // Create workflow
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Test Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    let station1_id = Uuid::new_v4();
    let station1 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 1".to_string(),
            position: 0,
            description: None,
            x_position: Some(100.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: Some(r#"["test_key"]"#.to_string()),
            is_terminator: Some(false),
        },
        station1_id,
    )
    .await?;

    let station2_id = Uuid::new_v4();
    let _station2 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 2".to_string(),
            position: 1,
            description: None,
            x_position: Some(300.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: None,
            is_terminator: Some(false),
        },
        station2_id,
    )
    .await?;

    // Create conditional transition
    let transition_id = Uuid::new_v4();
    let _transition = StationTransition::create(
        &pool,
        CreateStationTransition {
            workflow_id: workflow.id,
            source_station_id: station1.id,
            target_station_id: station2_id,
            condition: None,
            label: Some("If test_key = true".to_string()),
            condition_type: Some("conditional".to_string()),
            condition_value: Some(
                r#"{"check_output_key":"test_key","expected_value":true}"#.to_string(),
            ),
        },
        transition_id,
    )
    .await?;

    // Create workflow execution
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        &pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: task.id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // Create station execution with output_data that matches condition
    let station_execution_id = Uuid::new_v4();
    let station_execution = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station1.id,
            status: "completed".to_string(),
            execution_process_id: None,
        },
        station_execution_id,
    )
    .await?;

    // Update with output_data
    let station_execution = StationExecution::update(
        &pool,
        station_execution.id,
        db::models::station_execution::UpdateStationExecution {
            output_data: Some(r#"{"test_key":true}"#.to_string()),
            status: None,
            execution_process_id: None,
            started_at: None,
            completed_at: None,
        },
    )
    .await?;

    // Test: condition should be met
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let next_station = orchestrator
        .advance_to_next_station(
            workflow_execution.id,
            station1.id,
            &station_execution,
        )
        .await?;

    assert_eq!(next_station, Some(station2_id));

    Ok(())
}

// ============================================================================
// CONTEXT DATA GATHERING TESTS
// ============================================================================

#[sqlx::test(migrations = "../db/migrations")]
async fn test_gather_context_data_from_multiple_stations(
    pool: SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;
    let agent = create_test_agent(&pool).await?;
    let task = create_test_task(&pool, project.id).await?;
    let task_attempt = create_test_task_attempt(&pool, task.id).await?;

    // Create workflow
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Test Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    // Create stations
    let station1_id = Uuid::new_v4();
    let station1 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 1".to_string(),
            position: 0,
            description: None,
            x_position: Some(100.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: Some(r#"["key1"]"#.to_string()),
            is_terminator: Some(false),
        },
        station1_id,
    )
    .await?;

    let station2_id = Uuid::new_v4();
    let station2 = WorkflowStation::create(
        &pool,
        CreateWorkflowStation {
            workflow_id: workflow.id,
            name: "Station 2".to_string(),
            position: 1,
            description: None,
            x_position: Some(300.0),
            y_position: Some(100.0),
            agent_id: Some(agent.id),
            station_prompt: None,
            output_context_keys: Some(r#"["key2"]"#.to_string()),
            is_terminator: Some(false),
        },
        station2_id,
    )
    .await?;

    // Create workflow execution
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        &pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: task.id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // Create station executions with output data
    let se1_id = Uuid::new_v4();
    let _se1 = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station1.id,
            status: "completed".to_string(),
            execution_process_id: None,
        },
        se1_id,
    )
    .await?;

    StationExecution::update(
        &pool,
        se1_id,
        db::models::station_execution::UpdateStationExecution {
            output_data: Some(r#"{"key1":"value1"}"#.to_string()),
            status: None,
            execution_process_id: None,
            started_at: None,
            completed_at: None,
        },
    )
    .await?;

    let se2_id = Uuid::new_v4();
    let _se2 = StationExecution::create(
        &pool,
        CreateStationExecution {
            workflow_execution_id: workflow_execution.id,
            station_id: station2.id,
            status: "completed".to_string(),
            execution_process_id: None,
        },
        se2_id,
    )
    .await?;

    StationExecution::update(
        &pool,
        se2_id,
        db::models::station_execution::UpdateStationExecution {
            output_data: Some(r#"{"key2":"value2"}"#.to_string()),
            status: None,
            execution_process_id: None,
            started_at: None,
            completed_at: None,
        },
    )
    .await?;

    // Test: gather context should merge both outputs
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let context = orchestrator
        .gather_context_data(workflow_execution.id)
        .await?;

    assert_eq!(context["key1"], "value1");
    assert_eq!(context["key2"], "value2");

    Ok(())
}

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

#[sqlx::test(migrations = "../db/migrations")]
async fn test_nonexistent_workflow_fails(pool: SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);
    let nonexistent_id = Uuid::new_v4();

    let result = orchestrator.get_first_station(nonexistent_id).await;

    // Should succeed but return empty stations list, which causes NoStationConfigured
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        WorkflowOrchestratorError::NoStationConfigured
    ));

    Ok(())
}

#[sqlx::test(migrations = "../db/migrations")]
async fn test_workflow_with_no_stations_fails(
    pool: SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let project = create_test_project(&pool).await?;

    // Create workflow with no stations
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(
        &pool,
        CreateWorkflow {
            project_id: project.id,
            name: "Empty Workflow".to_string(),
            description: None,
        },
        workflow_id,
    )
    .await?;

    let db = DBService { pool: pool.clone() };
    let orchestrator = WorkflowOrchestrator::new(db);

    let result = orchestrator.get_first_station(workflow.id).await;

    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        WorkflowOrchestratorError::NoStationConfigured
    ));

    Ok(())
}
