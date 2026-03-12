const { execSync } = require('child_process');

const secrets = {
  VAPID_PUBLIC_KEY: 'BFeYQPH-QTk5rwGxzL3IOr-Ya3OanMTyb9-miBy69qSP4IfAopE5tuLEX2XiPFZtnSseilLNT2URtuIuyNVfjB4',
  VAPID_PRIVATE_KEY: 'QwXFiGwnXiOuR9VBWycnZUvExGyxA1e02AF1WzT2BsI'
};

const projectRef = 'canoruljgackpmziotel';

console.log('Setting Supabase secrets...');

for (const [key, value] of Object.entries(secrets)) {
  try {
    console.log(`Setting ${key}...`);
    execSync(`npx -y supabase secrets set --project-ref ${projectRef} ${key}="${value}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Failed to set ${key}:`, error.message);
    process.exit(1);
  }
}

console.log('Done!');
