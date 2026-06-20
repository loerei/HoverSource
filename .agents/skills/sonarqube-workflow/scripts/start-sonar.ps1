Write-Host "Checking and starting SonarQube & Postgres Docker containers..." -ForegroundColor Cyan

function Start-ContainerIfStopped ($name) {
    $status = docker inspect -f '{{.State.Running}}' $name 2>$null
    if ($status -eq "true") {
        Write-Host "Container '$name' is already running." -ForegroundColor Green
    } else {
        Write-Host "Starting container '$name'..." -ForegroundColor Yellow
        docker start $name
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to start container '$name'. Please make sure Docker is running and the container exists."
            exit 1
        }
        Write-Host "Container '$name' started successfully." -ForegroundColor Green
    }
}

Start-ContainerIfStopped "postgres"
Start-ContainerIfStopped "sonarqube"
