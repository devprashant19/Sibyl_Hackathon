import chalk from 'chalk';

export class ConfigLoadError extends Error {
  constructor(message: string, public readonly filepath: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class SDKMismatchError extends Error {
  constructor(message: string, public readonly expectedVersion: string, public readonly actualVersion: string) {
    super(message);
    this.name = 'SDKMismatchError';
  }
}

export function handleError(err: any): never {
  console.log(); // Blank line for spacing

  if (err instanceof ConfigLoadError) {
    console.error(chalk.red.bold('❌ Configuration Error'));
    console.error(chalk.white(err.message));
    console.error(chalk.gray(`\nTip: Run \`sibyl init\` to generate a default config file at ${err.filepath} if you don't have one.`));
  } 
  else if (err instanceof ApiKeyError) {
    console.error(chalk.red.bold('❌ API Key Missing or Invalid'));
    console.error(chalk.white(err.message));
    console.error(chalk.gray('\nTip: Set the ANTHROPIC_API_KEY environment variable. If you already have, ensure it is a valid sk-ant-api03-* key.'));
  } 
  else if (err instanceof NetworkError) {
    console.error(chalk.red.bold('❌ Network Failure'));
    console.error(chalk.white(err.message));
    console.error(chalk.gray('\nTip: Check your internet connection or the status of the Sibyl / Anthropic API endpoints.'));
  } 
  else if (err instanceof SDKMismatchError) {
    console.error(chalk.red.bold('❌ SDK Version Mismatch'));
    console.error(chalk.white(err.message));
    console.error(chalk.gray(`\nTip: Ensure both @sibyl-cli and your project's @sibyl-core versions are synchronized.`));
    console.error(chalk.gray(`Expected: ${err.expectedVersion} | Found: ${err.actualVersion}`));
  } 
  else {
    // Unhandled / unexpected errors still get a trace so we can debug them,
    // but we wrap them gracefully.
    console.error(chalk.red.bold('❌ Unexpected System Error'));
    console.error(chalk.white(err.message || 'An unknown error occurred.'));
    console.error(chalk.dim(err.stack));
    console.error(chalk.gray('\nTip: Please report this bug at https://github.com/devprashant19/Sibyl/issues'));
  }

  process.exit(1);
}
