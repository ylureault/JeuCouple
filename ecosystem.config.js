module.exports = {
  apps: [
    {
      name: 'jeu-couples',
      script: './app/backend/dist/index.js',
      cwd: '/home/ylureault/web/[DOMAIN]',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      env_file: '/home/ylureault/web/[DOMAIN]/app/backend/.env',
      error_file: '/home/ylureault/web/[DOMAIN]/logs/pm2-error.log',
      out_file: '/home/ylureault/web/[DOMAIN]/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true
    }
  ]
};
