$status = git status --porcelain
$count = 0
foreach ($line in $status) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    
    $file = $line.Substring(3)
    if ($file -match '^"(.*)"$') {
        $file = $matches[1]
    }
    
    git add $file
    
    $parts = $file -split '/'
    $msg = ""
    if ($parts[0] -eq 'packages' -and $parts.Length -gt 1) {
        $pkg = $parts[1]
        $filename = $parts[-1]
        $basename = [System.IO.Path]::GetFileNameWithoutExtension($filename)
        
        $action = "update"
        if ($line.StartsWith("A ") -or $line.StartsWith("??")) { $action = "add" }
        elseif ($line.StartsWith("D ")) { $action = "remove" }
        elseif ($line.StartsWith(" M") -or $line.StartsWith("M ")) { $action = "refactor" }
        
        if ($filename -match '\.test\.' -or $filename -match 'test' -or $file -match '/test/' -or $file -match '/tests/') {
            $msg = "test($pkg): $action coverage for $basename"
        } elseif ($filename -eq 'package.json') {
            $msg = "chore($pkg): $action package dependencies"
        } elseif ($filename -eq 'tsconfig.json' -or $filename -eq 'vitest.config.ts' -or $filename -eq 'next.config.ts') {
            $msg = "chore($pkg): $action configuration for $basename"
        } elseif ($pkg -eq 'integrations') {
            $integration = $parts[2]
            $msg = "feat($pkg): $action $integration integration for $basename"
        } elseif ($pkg -eq 'sdk-go') {
            $msg = "feat(sdk-go): $action Go SDK implementation for $basename"
        } elseif ($pkg -eq 'vscode-extension') {
            $msg = "feat(vscode): $action VSCode extension $basename"
        } else {
            if ($action -eq 'add') {
                $msg = "feat($pkg): introduce $basename module"
            } elseif ($action -eq 'remove') {
                $msg = "refactor($pkg): deprecate $basename module"
            } else {
                $msg = "refactor($pkg): improve $basename implementation"
            }
        }
    } else {
        $filename = $parts[-1]
        $msg = "chore: update $filename configuration"
    }
    
    git commit -m $msg
    $count++
}

Write-Host "Created $count commits."
