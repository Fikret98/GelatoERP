
$url = "https://canorulijpckomziotel.supabase.co/rest/v1/secrets?select=*"
$key = "$(Get-Content .env.local | Select-String "VITE_SUPABASE_ANON_KEY" | ForEach-Object { $_.ToString().Split('=')[1].Trim() })"

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

Invoke-RestMethod -Uri $url -Headers $headers | ConvertTo-Json
