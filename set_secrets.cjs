const { execSync } = require('child_process');

const secrets = {
  VAPID_PUBLIC_KEY: 'BFsCmKN5EyRWAs6XPIxmMwEH3BOYAjECqRn2LZgPYJMqigPUmjxeO2UTNkBUDQ9anOrvqjEFMU78E6ZvnTi9NlE',
  VAPID_PRIVATE_KEY: 'IduX3jUkWRhz2ADp2FHwK7iDWqiAbTjSL0sInHapvg'
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
