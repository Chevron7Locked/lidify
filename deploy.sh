#!/bin/bash
# Kima Deploy Script
# Builds Docker image and cleans up old images/cache to prevent disk bloat

set -e

# Configuration
IMAGE_NAME="${DOCKERHUB_USERNAME:-chevron7locked}/kima"
VERSION="${VERSION:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${VERSION}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Kima Deploy ===${NC}"
echo "Building: ${FULL_IMAGE}"
echo ""

# Show disk usage before
echo -e "${YELLOW}Disk usage before build:${NC}"
docker system df

# Count dangling images before
DANGLING_BEFORE=$(docker images -f "dangling=true" -q | wc -l)
echo -e "Dangling images before: ${DANGLING_BEFORE}"
echo ""

# Build the image
echo -e "${GREEN}Building Docker image...${NC}"
docker build \
    --build-arg NEXT_PUBLIC_API_URL="" \
    -t "${FULL_IMAGE}" \
    -f frontend/Dockerfile \
    frontend/

echo ""
echo -e "${GREEN}Build complete!${NC}"

# Count dangling images after build
DANGLING_AFTER=$(docker images -f "dangling=true" -q | wc -l)
echo -e "Dangling images after build: ${DANGLING_AFTER}"

# Clean up old images and build cache
echo ""
echo -e "${YELLOW}Cleaning up old images and build cache...${NC}"

# Remove dangling images (old versions of :latest)
PRUNED_IMAGES=$(docker image prune -f 2>&1)
echo "${PRUNED_IMAGES}"

# Remove build cache older than 24 hours
PRUNED_CACHE=$(docker builder prune -f --filter "until=24h" 2>&1)
echo "${PRUNED_CACHE}"

# Show disk usage after
echo ""
echo -e "${YELLOW}Disk usage after cleanup:${NC}"
docker system df

# Count dangling images after cleanup
DANGLING_FINAL=$(docker images -f "dangling=true" -q | wc -l)
echo -e "Dangling images after cleanup: ${DANGLING_FINAL}"

echo ""
echo -e "${GREEN}=== Deploy Complete ===${NC}"
echo "Image ready: ${FULL_IMAGE}"
echo ""

# Optional: push to DockerHub
if [[ "$1" == "--push" ]]; then
    echo -e "${GREEN}Pushing to DockerHub...${NC}"
    docker push "${FULL_IMAGE}"
    echo -e "${GREEN}Push complete!${NC}"
else
    echo "Run with --push to push to DockerHub"
fi
