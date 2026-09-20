// vars/sibyl.groovy
// Jenkins Shared Library for Sibyl Chaos Engineering

def call(Map config = [:]) {
    def target = config.get('target', 'sibyl.config.ts')
    def iterations = config.get('iterations', '100')

    echo "Running Sibyl Chaos Engine..."
    
    // Assumes Node.js is available in the Jenkins agent workspace
    sh """
        export SIBYL_JENKINS_RUN=true
        export SIBYL_TARGET=${target}
        export SIBYL_ITERATIONS=${iterations}
        
        npx @sibyl/cli ci --target \$SIBYL_TARGET --iterations \$SIBYL_ITERATIONS
    """
}
