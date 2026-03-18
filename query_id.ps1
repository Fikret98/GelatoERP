$Headers = @{
    'apikey' = 'sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
    'Authorization' = 'Bearer sb_publishable_mjPXgZBzTwl5b0XWAqALbw_Gpdv2LAF'
}
$Uri = 'https://canoruljgackpmziotel.supabase.co/rest/v1/fixed_assets?cost=eq.600&select=id,name,payment_method'
Invoke-RestMethod -Uri $Uri -Headers $Headers | ConvertTo-Json
