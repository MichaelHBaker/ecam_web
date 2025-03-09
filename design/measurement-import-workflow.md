# Measurement Import Workflow Specification

## Overview

This document outlines the architecture and workflow for adding measurements to locations through a multi-stage import process. The workflow leverages existing manager components while maintaining clear separation of concerns.

## Components & Key Methods

### 1. Tree Manager
- **Existing Methods**:
  - `handleNodeAdd()`: Initiates the add process
  - `refreshLocationChildren()`: Reloads location children
  - `loadNodeChildren()`: Loads node children from API
  - `setupEventListeners()`: Sets up event delegation

- **New Methods**:
  - `setupImportCompletionSubscription()`: Watches for import completion via state

### 2. Modal Manager
- **Existing Methods**:
  - `show()`: Shows a modal with given options
  - `hide()`: Hides a modal
  - `createModalElement()`: Creates a modal element
  - `setupModal()`: Sets up modal structure and events
  - `animateModal()`: Handles animation
  - `positionModal()`: Positions modal on screen

### 3. Import Manager
- **Existing Methods**:
  - `initialize()`: Sets up the import manager
  - `initializeUI()`: Initializes UI elements
  - `initializeDropZone()`: Sets up file drop zone
  - `initializeFileInput()`: Sets up file input
  - `attachEventListeners()`: Sets up event listeners
  - `handleFileSelect()`: Processes file selection
  - `validateFile()`: Validates file format and content
  - `uploadFile()`: Uploads file to server
  - `showFileInfo()`: Displays file information
  - `showPreview()`: Shows file preview
  - `validateImport()`: Validates import configuration
  - `updateStatus()`: Updates import status
  - `updateState()`: Updates import state

- **New Methods**:
  - `setupStateSubscriptions()`: Subscribes to tree state changes
  - `getConfigurationFromForm()`: Extracts config from UI
  - `showValidationErrors()`: Displays configuration errors
  - `showStartImportButton()`: Shows the start import button
  - `getTimeZoneOptions()`: Generates timezone select options
  - `getColumnMappingUI()`: Generates column mapping UI

### 4. CodeMirror Manager
- **Existing Methods**:
  - `initialize()`: Sets up the CodeMirror manager
  - `create()`: Creates a new CodeMirror instance
  - `getInstance()`: Gets a CodeMirror instance
  - `loadFile()`: Loads file content
  - `setContent()`: Sets editor content

## Workflow Sequence

### 1. Initiating Import Process

1. User clicks "Add Measurement" on a location node
2. Tree Manager's `handleNodeAdd()` is triggered and:
   - Shows a basic modal with container using Modal.show()
   - Updates state with action type "add_measurement"
   - Sets up import completion subscription

3. Import Manager detects state change through `setupStateSubscriptions()` and:
   - Initializes itself if not already
   - Sets up UI in the modal container using `initializeUI()`

### 2. File Selection & Validation

1. User selects a file, triggering Import Manager's `handleFileSelect()`
2. Import Manager validates file with `validateFile()`
3. If valid, updates status to "uploading" and displays file info with `showFileInfo()`
4. Uploads file with `uploadFile()`
5. Shows preview with `showPreview()`, which uses CodeMirror Manager
6. Initiates validation with `validateImport()`

### 3. Data Configuration

1. Import Manager displays validation results with `showValidationResults()`
2. User configures data mapping using the generated UI
3. User clicks validate, Import Manager extracts config using `getConfigurationFromForm()`
4. Configuration sent to server with existing `configureImport()`
5. If valid, Import Manager shows start button using `showStartImportButton()`

### 4. Import Processing

1. User starts import, triggering Import Manager's `startImport()`
2. Import status updated to "in_progress"
3. Import Manager starts polling for updates with `startPolling()`
4. Progress displayed to user with `updateProgress()`

### 5. Import Completion

1. Import Manager detects completion through polling
2. Updates status to "completed" and state with `updateState()`
3. Closes modal after a delay
4. Tree Manager's subscription detects completion
5. Tree Manager refreshes location's children with `refreshLocationChildren()`

## State-Based Communication

### Tree State Updates
- Tree Manager updates state with `currentAction: { type: 'add_measurement', locationId: nodeId }`
- Import Manager subscribes to this state change

### Import State Updates
- Import Manager updates state as import progresses
- Tree Manager subscribes to completion status

## Error Handling

Each component handles errors consistently:
1. Catch errors in try/catch blocks
2. Log errors with context
3. Notify user via NotificationUI
4. Update error state
5. Handle graceful degradation

## Implementation Guidelines

1. **Leverage Existing Methods**: Use existing manager methods where possible
2. **State-Driven Communication**: Components communicate through state changes
3. **Lazy Loading**: Initialize components only when needed
4. **Progressive Enhancement**: Build UI in stages based on user actions
5. **Separation of Concerns**: 
   - Tree Manager: Handles tree structure
   - Modal Manager: Handles modal windows
   - Import Manager: Handles import process
   - CodeMirror Manager: Handles code editing

## Component Initialization Sequence

1. Tree Manager is initialized on page load
2. Modal Manager is initialized on page load
3. Import Manager is initialized when needed
4. CodeMirror Manager is initialized when needed

This approach maintains separation of concerns while leveraging existing functionality, creating a maintainable and extensible system for measurement import.
