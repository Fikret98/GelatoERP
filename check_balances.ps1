$Headers = @{
    'apikey' = 'sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
    'Authorization' = 'Bearer sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
}
$CashUri = 'https://canoruljgackpmziotel.supabase.co/rest/v1/rpc/get_current_cash_balance'
$BankUri = 'https://canoruljgackpmziotel.supabase.co/rest/v1/rpc/get_current_bank_balance'

$Cash = Invoke-RestMethod -Uri $CashUri -Headers $Headers -Method Post
$Bank = Invoke-RestMethod -Uri $BankUri -Headers $Headers -Method Post

Write-Output "Cash Balance: $Cash"
Write-Output "Bank Balance: $Bank"
