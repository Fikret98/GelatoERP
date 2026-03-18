$Headers = @{
    'apikey' = 'sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
    'Authorization' = 'Bearer sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
    'Content-Type' = 'application/json'
}

# 1. Find the fixed asset
$Uri = 'https://canoruljgackpmziotel.supabase.co/rest/v1/fixed_assets?cost=eq.600&select=id,name,payment_method'
$Asset = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get

if ($Asset) {
    $AssetId = $Asset[0].id
    Write-Output "Found Asset ID: $AssetId (Name: $($Asset[0].name))"

    # 2. Update the fixed asset to 'cash'
    $UpdateUri = "https://canoruljgackpmziotel.supabase.co/rest/v1/fixed_assets?id=eq.$AssetId"
    $Body = @{ payment_method = 'cash' } | ConvertTo-Json
    Invoke-RestMethod -Uri $UpdateUri -Headers $Headers -Method Patch -Body $Body
    Write-Output "Updated fixed_assets record $AssetId to payment_method='cash'"

    # 3. Update the corresponding expense
    # Note: The expense was created by a trigger, so it should have category='Əsas Vəsait Alışı' and asset_id=$AssetId
    $ExpenseUri = "https://canoruljgackpmziotel.supabase.co/rest/v1/expenses?asset_id=eq.$AssetId"
    Invoke-RestMethod -Uri $ExpenseUri -Headers $Headers -Method Patch -Body $Body
    Write-Output "Updated corresponding expense record to payment_method='cash'"
} else {
    Write-Output "Asset with cost 600 not found."
}
