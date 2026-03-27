load('ext://helm_resource', 'helm_resource', 'helm_repo')

allow_k8s_contexts('k3d-spec-factory')

# Load dev secrets (fall back to example if dev-secrets.env doesn't exist)
if os.path.exists('dev-secrets.env'):
    secrets = read_file('dev-secrets.env')
else:
    secrets = read_file('dev-secrets.env.example')
    print('WARNING: dev-secrets.env not found, using dev-secrets.env.example')

# Parse secrets from env file
def parse_env(content):
    result = {}
    for line in str(content).splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            parts = line.split('=', 1)
            if len(parts) == 2:
                result[parts[0].strip()] = parts[1].strip()
    return result

env_vars = parse_env(secrets)

# Create K8s secret for shared secrets
k8s_yaml(blob("""
apiVersion: v1
kind: Secret
metadata:
  name: spec-factory-secrets
type: Opaque
stringData:
  HASURA_GRAPHQL_ADMIN_SECRET: "{hasura_secret}"
  ANTHROPIC_API_KEY: "{anthropic_key}"
  ENCRYPTION_KEY: "{encryption_key}"
  NUXT_SESSION_PASSWORD: "{session_password}"
""".format(
    hasura_secret=env_vars.get('HASURA_GRAPHQL_ADMIN_SECRET', 'specfactory-dev-secret'),
    anthropic_key=env_vars.get('ANTHROPIC_API_KEY', ''),
    encryption_key=env_vars.get('ENCRYPTION_KEY', ''),
    session_password=env_vars.get('NUXT_SESSION_PASSWORD', ''),
)))

# PostgreSQL
k8s_yaml('infra/postgres.yaml')
k8s_resource('postgres', port_forwards=['5432:5432'])

# Hasura via Helm (custom image with metadata baked in)
hasura_admin_secret = env_vars.get('HASURA_GRAPHQL_ADMIN_SECRET', 'specfactory-dev-secret')

docker_build(
    'spec-factory-hasura',
    context='hasura',
    dockerfile='hasura/Dockerfile',
    live_update=[
        sync('hasura/metadata', '/hasura-metadata'),
    ],
)

helm_resource(
    'hasura',
    'graphql-engine',
    resource_deps=['postgres'],
    port_forwards=['8080:8080'],
    flags=[
        '--repo=https://hasura.github.io/helm-charts',
        '--values=deploy/helm/hasura-values.yaml',
        '--set=secret.adminSecret=' + hasura_admin_secret,
    ],
    image_deps=['spec-factory-hasura'],
    image_keys=[('image.repository', 'image.tag')],
    labels=['graphql'],
)

# Frontend
docker_build(
    'spec-factory-frontend',
    '.',
    dockerfile='services/frontend/Dockerfile.dev',
    live_update=[
        sync('packages/shared/src', '/app/packages/shared/src'),
        sync('services/frontend', '/app/services/frontend'),
    ],
)
k8s_yaml('deploy/k8s/frontend.yaml')
k8s_resource('frontend', port_forwards=['3000:3000'], resource_deps=['postgres', 'hasura'])

# Agent
docker_build(
    'spec-factory-agent',
    '.',
    dockerfile='services/agent/Dockerfile.dev',
    live_update=[
        sync('packages/shared/src', '/app/packages/shared/src'),
        sync('services/agent', '/app/services/agent'),
    ],
)
k8s_yaml('deploy/k8s/agent.yaml')
k8s_resource('agent', port_forwards=['3001:3001'], resource_deps=['postgres', 'hasura'])
