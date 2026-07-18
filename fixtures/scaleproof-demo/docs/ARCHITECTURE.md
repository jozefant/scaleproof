# Architecture

The application is currently one Express process backed by PostgreSQL. Feature
modules and an asynchronous worker boundary are planned, but no ownership or
availability decisions have been recorded yet.
