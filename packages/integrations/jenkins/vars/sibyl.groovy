// vars/sibyl.groovy
// Jenkins shared-library step that runs `sibyl ci` and publishes its JUnit report.
//
//   sibyl(config: 'sibyl.config.ts', iterations: 200, apiUrl: 'https://sibyl.example.com',
//         apiTokenCredentialsId: 'sibyl-api-token')
//
// Fails the build when any run fails or errors (and, unless allowIntermittent is true, when any run
// is intermittent) or when the config cannot be loaded; the JUnit report is published either way.
//
// Prerequisites: Node.js 22 on the agent, and a checked-out, installed project whose dependencies
// include @sibyl/cli and @sibyl/core (the CLI is not published to npm; the config imports
// @sibyl/core). Uses the Credentials Binding and JUnit plugins.

def call(Map config = [:]) {
    def sibylEnv = [
        "SIBYL_CONFIG=${config.get('config', 'sibyl.config.ts')}",
        "SIBYL_ITERATIONS=${config.get('iterations', '')}",
        "SIBYL_SEED=${config.get('seed', '')}",
        "SIBYL_JUNIT=${config.get('junit', 'reports/sibyl-junit.xml')}",
        "SIBYL_REQUIRE_UPLOAD=${config.get('requireUpload', false)}",
        "SIBYL_ALLOW_INTERMITTENT=${config.get('allowIntermittent', false)}",
        "SIBYL_CLI=${config.get('cli', 'npx --no sibyl')}",
    ]
    if (config.apiUrl) {
        sibylEnv << "SIBYL_API_URL=${config.apiUrl}"
    }
    def junitPath = config.get('junit', 'reports/sibyl-junit.xml')

    // Values reach the shell only as environment variables; the script itself is a constant
    // (single-quoted Groovy string), so parameters cannot inject shell.
    def shellScript = '''
        set -e
        set -- ci -c "$SIBYL_CONFIG" --junit "$SIBYL_JUNIT"
        if [ -n "$SIBYL_ITERATIONS" ]; then set -- "$@" -n "$SIBYL_ITERATIONS"; fi
        if [ -n "$SIBYL_SEED" ]; then set -- "$@" --seed "$SIBYL_SEED"; fi
        if [ "$SIBYL_REQUIRE_UPLOAD" = "true" ]; then set -- "$@" --require-upload; fi
        if [ "$SIBYL_ALLOW_INTERMITTENT" = "true" ]; then set -- "$@" --allow-intermittent; fi
        $SIBYL_CLI "$@"
    '''

    withEnv(sibylEnv) {
        try {
            if (config.apiTokenCredentialsId) {
                withCredentials([string(credentialsId: config.apiTokenCredentialsId, variable: 'SIBYL_API_TOKEN')]) {
                    sh shellScript
                }
            } else {
                sh shellScript
            }
        } finally {
            junit allowEmptyResults: true, testResults: junitPath
        }
    }
}
