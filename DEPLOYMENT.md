# 🚀 AWS EC2 Deployment Guide
# 5-Tier Hybrid LLM System

## 📋 Overview

This guide covers deploying the 5-Tier Hybrid LLM Orchestrator to AWS EC2 using Docker containers with production-grade security and monitoring.

## 🏗️ Architecture

```
Internet → ALB → EC2 Instance → Docker Containers
                                     ├── Nginx (Reverse Proxy)
                                     ├── LLM Orchestrator (Main App)
                                     └── Redis (Optional Cache)
```

## 📦 Prerequisites

### AWS Requirements
- AWS Account with EC2, VPC, and Security Groups access
- EC2 Key Pair for SSH access
- Elastic IP (optional but recommended)

### Local Requirements
- AWS CLI installed and configured
- Docker and Docker Compose installed (for local testing)
- SSH client

## 🖥️ EC2 Instance Setup

### 1. Launch EC2 Instance

**Recommended Configuration:**
- **Instance Type**: `t3.medium` (2 vCPU, 4 GB RAM) minimum
- **AMI**: Amazon Linux 2023 or Ubuntu 22.04 LTS
- **Storage**: 20 GB GP3 SSD minimum
- **Security Groups**: See security section below

### 2. Connect and Update System

```bash
# Connect via SSH
ssh -i your-key.pem ec2-user@your-ec2-ip

# Update system
sudo yum update -y  # Amazon Linux
# OR
sudo apt update && sudo apt upgrade -y  # Ubuntu
```

### 3. Install Docker and Docker Compose

**Amazon Linux 2023:**
```bash
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Re-login to apply group changes
exit
ssh -i your-key.pem ec2-user@your-ec2-ip
```

**Ubuntu 22.04:**
```bash
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker $USER

# Re-login to apply group changes
exit
ssh -i your-key.pem ubuntu@your-ec2-ip
```

## 🔐 Security Group Configuration

Create a security group with the following rules:

### Inbound Rules
| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP/32 | SSH access (restrict to your IP) |
| HTTP | 80 | 0.0.0.0/0 | HTTP redirect to HTTPS |
| HTTPS | 443 | 0.0.0.0/0 | HTTPS API access |
| Custom | 4000 | 10.0.0.0/8 | Internal LLM service (VPC only) |

### Outbound Rules
| Type | Port | Destination | Description |
|------|------|-------------|-------------|
| All Traffic | All | 0.0.0.0/0 | Internet access for API calls |

## 🚀 Application Deployment

### 1. Clone Repository

```bash
# Create application directory
mkdir -p /opt/llm-orchestrator
cd /opt/llm-orchestrator

# Clone or upload your application files
# Option 1: Git clone (if repository is accessible)
git clone https://github.com/your-username/hybrid-llm-system.git .

# Option 2: Upload files via SCP
# scp -i your-key.pem -r ./llm-orchestrator/* ec2-user@your-ec2-ip:/opt/llm-orchestrator/
```

### 2. Configure Environment Variables

```bash
# Copy and edit production environment file
cp .env.production .env

# Edit environment variables
nano .env
```

**Required Configuration:**
```bash
# API Keys (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_API_KEY=your-google-ai-api-key
OPENROUTER_API_KEY=sk-or-your-openrouter-key

# Security
JWT_SECRET=$(openssl rand -base64 32)

# System
NODE_ENV=production
PORT=4000
MONTHLY_BUDGET=70
```

### 3. Generate SSL Certificates

**Option A: Self-signed (Development)**
```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/server.key -out ssl/server.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=your-domain.com"
```

**Option B: Let's Encrypt (Production)**
```bash
# Install certbot
sudo yum install -y certbot  # Amazon Linux
# OR
sudo apt install -y certbot  # Ubuntu

# Generate certificate (requires domain pointing to your EC2)
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/server.crt
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/server.key
sudo chown -R $USER:$USER ssl/
```

### 4. Deploy with Docker Compose

```bash
# Build and start services
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f llm-orchestrator
```

### 5. Verify Deployment

```bash
# Health check
curl -k https://localhost/health

# System info
curl -k https://localhost/info

# Test API endpoint
curl -k -X POST https://localhost/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello world", "task_type": "general"}'
```

## 📊 Monitoring and Maintenance

### 1. Set up Log Rotation

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/llm-orchestrator << EOF
/opt/llm-orchestrator/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/llm-orchestrator/docker-compose.yml restart llm-orchestrator
    endscript
}
EOF
```

### 2. System Monitoring

```bash
# Create monitoring script
cat > /opt/llm-orchestrator/monitor.sh << 'EOF'
#!/bin/bash
# System health monitoring script

LOG_FILE="/opt/llm-orchestrator/logs/system-monitor.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check Docker containers
if ! docker-compose ps | grep -q "Up"; then
    echo "[$DATE] ERROR: Docker containers not running" >> $LOG_FILE
    docker-compose restart >> $LOG_FILE 2>&1
fi

# Check API health
if ! curl -sf http://localhost:4000/health > /dev/null; then
    echo "[$DATE] ERROR: API health check failed" >> $LOG_FILE
    docker-compose restart llm-orchestrator >> $LOG_FILE 2>&1
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "[$DATE] WARNING: Disk usage at ${DISK_USAGE}%" >> $LOG_FILE
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ $MEM_USAGE -gt 85 ]; then
    echo "[$DATE] WARNING: Memory usage at ${MEM_USAGE}%" >> $LOG_FILE
fi

echo "[$DATE] System check completed" >> $LOG_FILE
EOF

chmod +x /opt/llm-orchestrator/monitor.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/llm-orchestrator/monitor.sh") | crontab -
```

### 3. Automatic Updates

```bash
# Create update script
cat > /opt/llm-orchestrator/update.sh << 'EOF'
#!/bin/bash
cd /opt/llm-orchestrator

# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Cleanup old images
docker image prune -f

echo "Update completed: $(date)"
EOF

chmod +x /opt/llm-orchestrator/update.sh
```

## 🔧 Performance Tuning

### 1. EC2 Instance Optimization

**For Production Workloads:**
- **Instance Type**: `c5.large` or `c5.xlarge` for CPU-intensive tasks
- **Instance Type**: `r5.large` or `r5.xlarge` for memory-intensive tasks
- **Enhanced Networking**: Enable for better performance

### 2. Docker Resource Limits

Edit `docker-compose.yml`:
```yaml
services:
  llm-orchestrator:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
```

### 3. Nginx Optimization

For high-traffic scenarios, update `nginx.conf`:
```nginx
# Increase worker processes
worker_processes auto;

# Increase worker connections
events {
    worker_connections 2048;
}

# Add caching
http {
    # Enable caching
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m inactive=60m;
    
    # Cache static responses
    location /info {
        proxy_cache api_cache;
        proxy_cache_valid 200 5m;
        # ... existing proxy config
    }
}
```

## 🚨 Troubleshooting

### Common Issues

**1. Container fails to start**
```bash
# Check logs
docker-compose logs llm-orchestrator

# Check environment variables
docker-compose exec llm-orchestrator env | grep API_KEY
```

**2. API requests timing out**
```bash
# Increase timeout in docker-compose.yml
environment:
  - REQUEST_TIMEOUT=60000
```

**3. High memory usage**
```bash
# Monitor container resources
docker stats

# Restart services
docker-compose restart
```

**4. SSL certificate issues**
```bash
# Test certificate
openssl x509 -in ssl/server.crt -text -noout

# Regenerate if expired
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/server.key -out ssl/server.crt
```

### Log Locations

- **Application Logs**: `/opt/llm-orchestrator/logs/`
- **Docker Logs**: `docker-compose logs [service]`
- **System Logs**: `/var/log/syslog` or `/var/log/messages`
- **Nginx Logs**: Container logs via `docker-compose logs nginx`

## 🔄 Backup and Recovery

### 1. Data Backup

```bash
# Create backup script
cat > /opt/llm-orchestrator/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/llm-orchestrator"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup application data
tar -czf "$BACKUP_DIR/llm-data-$DATE.tar.gz" \
  /opt/llm-orchestrator/data \
  /opt/llm-orchestrator/logs \
  /opt/llm-orchestrator/.env

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/llm-data-$DATE.tar.gz"
EOF

chmod +x /opt/llm-orchestrator/backup.sh

# Schedule daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/llm-orchestrator/backup.sh") | crontab -
```

### 2. Disaster Recovery

```bash
# Restore from backup
tar -xzf /opt/backups/llm-orchestrator/llm-data-YYYYMMDD_HHMMSS.tar.gz -C /

# Restart services
cd /opt/llm-orchestrator
docker-compose down
docker-compose up -d
```

## 📈 Scaling Considerations

### Horizontal Scaling (Multiple Instances)

1. **Application Load Balancer (ALB)**
   - Distribute traffic across multiple EC2 instances
   - Health checks on `/health` endpoint

2. **Shared State Management**
   - Use external Redis cluster for session management
   - Centralized database for cost tracking

3. **Auto Scaling Group**
   - Scale based on CPU/memory metrics
   - Minimum 2 instances for high availability

### Vertical Scaling

- **CPU-bound**: Use compute-optimized instances (C5, C5n)
- **Memory-bound**: Use memory-optimized instances (R5, R5n)
- **Network-bound**: Use network-optimized instances (M5n, C5n)

---

## 📞 Support

For deployment issues or questions:
1. Check logs using provided commands
2. Review troubleshooting section
3. Consult application documentation
4. Contact system administrator

**Deployment Status**: Production Ready ✅