#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-truckmoov}"

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

for name in   AUTH_SERVICE_MANIFEST AUTH_BLUE_MANIFEST AUTH_GREEN_MANIFEST   FLEET_SERVICE_MANIFEST FLEET_BLUE_MANIFEST FLEET_GREEN_MANIFEST   AUTH_IMAGE FLEET_IMAGE; do
  require_var "$name"
done

service_track() {
  local service="$1"
  kubectl get service "$service" -n "$NAMESPACE" -o jsonpath='{.spec.selector.truckmoov\.track}' 2>/dev/null || true
}

deployment_exists() {
  kubectl get deployment "$1" -n "$NAMESPACE" >/dev/null 2>&1
}

deployment_image() {
  kubectl get deployment "$1" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true
}

service_exists() {
  kubectl get service "$1" -n "$NAMESPACE" >/dev/null 2>&1
}

patch_service_track() {
  local service="$1"
  local app_name="$2"
  local track="$3"
  kubectl patch service "$service" -n "$NAMESPACE" --type merge -p     "{"spec":{"selector":{"app.kubernetes.io/name":"$app_name","truckmoov.track":"$track"}}}"
}

scale_down_if_exists() {
  if deployment_exists "$1"; then
    kubectl scale deployment "$1" -n "$NAMESPACE" --replicas=0 >/dev/null
  fi
}

cleanup_images() {
  local repo="$1"
  local keep_current="$2"
  local keep_previous="$3"
  local image

  while IFS= read -r image; do
    [[ -z "$image" ]] && continue
    if [[ "$image" == "$keep_current" || ( -n "$keep_previous" && "$image" == "$keep_previous" ) ]]; then
      continue
    fi
    docker image rm -f "$image" >/dev/null 2>&1 || true
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep "^${repo}:sha-" || true)

  while IFS= read -r image; do
    [[ -z "$image" ]] && continue
    if [[ "$image" == *"$keep_current" || ( -n "$keep_previous" && "$image" == *"$keep_previous" ) ]]; then
      continue
    fi
    sudo -n k3s ctr images rm "$image" >/dev/null 2>&1 || true
  done < <(sudo -n k3s ctr images ls -q | grep "${repo}:sha-" || true)
}

deploy_service() {
  local app_name="$1"
  local service_name="$2"
  local legacy_deployment="$3"
  local service_manifest="$4"
  local blue_manifest="$5"
  local green_manifest="$6"
  local repo="$7"

  local active_track inactive_track target_manifest previous_image current_image

  active_track="$(service_track "$service_name")"
  case "$active_track" in
    blue)
      inactive_track="green"
      ;;
    green)
      inactive_track="blue"
      ;;
    *)
      inactive_track="blue"
      ;;
  esac

  if [[ "$inactive_track" == "blue" ]]; then
    target_manifest="$blue_manifest"
  else
    target_manifest="$green_manifest"
  fi

  previous_image=""
  if [[ "$active_track" == "blue" || "$active_track" == "green" ]]; then
    previous_image="$(deployment_image "${service_name}-${active_track}")"
  elif deployment_exists "$legacy_deployment"; then
    previous_image="$(deployment_image "$legacy_deployment")"
  fi

  kubectl apply --validate=false -f "$target_manifest"
  kubectl rollout status "deployment/${service_name}-${inactive_track}" -n "$NAMESPACE" --timeout=300s

  if ! service_exists "$service_name"; then
    kubectl apply --validate=false -f "$service_manifest"
  fi
  patch_service_track "$service_name" "$app_name" "$inactive_track"

  if deployment_exists "$legacy_deployment"; then
    kubectl delete deployment "$legacy_deployment" -n "$NAMESPACE" --ignore-not-found
  fi

  if [[ "$active_track" == "blue" || "$active_track" == "green" ]]; then
    scale_down_if_exists "${service_name}-${active_track}"
  fi

  current_image="$(deployment_image "${service_name}-${inactive_track}")"
  cleanup_images "$repo" "$current_image" "$previous_image"
}

deploy_service   "auth-service"   "auth-service"   "auth-service"   "$AUTH_SERVICE_MANIFEST"   "$AUTH_BLUE_MANIFEST"   "$AUTH_GREEN_MANIFEST"   "truckmoov-auth"

deploy_service   "fleet-service"   "fleet-service"   "fleet-service"   "$FLEET_SERVICE_MANIFEST"   "$FLEET_BLUE_MANIFEST"   "$FLEET_GREEN_MANIFEST"   "truckmoov-fleet"
