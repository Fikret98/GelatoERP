import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, url, icon, image, actions, user_id, role, broadcast } = await req.json()
    console.log(`[send-push] Processing notification: ${title}`)

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Identify target user IDs
    let targetUserIds: string[] = []
    if (user_id) {
      targetUserIds = [user_id]
    } else if (role) {
      const { data: users } = await supabase.from('users').select('id').eq('role', role)
      targetUserIds = users?.map(u => u.id) || []
    } else if (broadcast) {
      const { data: users } = await supabase.from('users').select('id')
      targetUserIds = users?.map(u => u.id) || []
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No target users found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Setup VAPID
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!publicKey || !privateKey) {
      throw new Error('VAPID keys are missing from environment variables')
    }

    webpush.setVapidDetails('mailto:admin@gelato.az', publicKey, privateKey)

    // Get subscriptions for all target users
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds)

    if (error) throw error
    console.log(`[send-push] Sending to ${subscriptions?.length || 0} subscriptions for ${targetUserIds.length} users`)

    const results = await Promise.all((subscriptions || []).map(async (sub) => {
      try {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh
          }
        }

        await webpush.sendNotification(pushConfig, JSON.stringify({
          title,
          body,
          url,
          icon: icon || '/icon-192.png',
          image: image || null,
          actions: actions || []
        }))

        return { success: true, endpoint: sub.endpoint }
      } catch (err) {
        console.error(`[send-push] Error sending to ${sub.endpoint}:`, err)
        // If 401, 403, 404 or 410, sub is expired/invalid
        if ([401, 403, 404, 410].includes(err.statusCode)) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        return { success: false, error: err.message, endpoint: sub.endpoint }
      }
    }))

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[send-push] Critical error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
