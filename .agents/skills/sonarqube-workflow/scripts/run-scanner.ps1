param (
    [string]$ProjectKey,
    [string]$Token,
    [string]$Network,
    [string]$HostUrl = "http://host.docker.internal:9000"
)

# Try reading from environment variables if not passed
if (-not $ProjectKey) { $ProjectKey = $env:SONAR_PROJECT_KEY }
if (-not $Token) { $Token = $env:SONAR_TOKEN }

# Try auto-detecting from sonar-project.properties
if (-not $ProjectKey -and (Test-Path "sonar-project.properties")) {
    $properties = Get-Content "sonar-project.properties" -Raw
    if ($properties -match "sonar.projectKey\s*=\s*(.+)") {
        $ProjectKey = $Matches[1].Trim()
    }
}

if (-not $ProjectKey) {
    $ProjectKey = Read-Host "Enter SonarQube Project Key"
}
if (-not $Token) {
    $Token = Read-Host "Enter SonarQube Token"
}

if (-not $ProjectKey -or -not $Token) {
    Write-Error "ProjectKey and Token are required to run the scan."
    exit 1
}

$volPath = $pwd.Path
Write-Host "Running SonarScanner CLI for project '$ProjectKey' on folder '$volPath'..." -ForegroundColor Cyan

$dockerArgs = @("run", "--rm", "-v", "${volPath}:/usr/src")

if ($Network) {
    $dockerArgs += @("--network", $Network)
    if ($HostUrl -eq "http://host.docker.internal:9000") {
        $HostUrl = "http://sonarqube:9000"
    }
}

$dockerArgs += @(
    "sonarsource/sonar-scanner-cli",
    "-Dsonar.projectKey=$ProjectKey",
    "-Dsonar.token=$Token",
    "-Dsonar.host.url=$HostUrl",
    "-Dsonar.scm.disabled=true"
)

Write-Host "Executing docker command: docker $($dockerArgs -join ' ')" -ForegroundColor Yellow
& docker $dockerArgs
