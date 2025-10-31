import assert from 'node:assert';
import { writeFileSync, unlinkSync } from 'node:fs';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { loadConfig, resetConfig } from '../src/config/service.js';

describe('Configuration Management', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    for (const file of ['./config.json', './config.yaml', './config.yml']) {
      try {
        unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('should load default configuration', () => {
    const config = loadConfig();
    assert.equal(config.port, 8080);
    assert.equal(config['ignore-robots-txt'], false);
    assert.equal(config['cache-max-size'], 50);
  });

  it('should load configuration from CLI args', () => {
    const config = loadConfig({
      cliArgs: ['--port', '9090', '--ignore-robots-txt'],
    });
    assert.equal(config.port, 9090);
    assert.equal(config['ignore-robots-txt'], true);
  });

  it('should load user-agent from CLI', () => {
    const config = loadConfig({
      cliArgs: ['--user-agent', 'CustomAgent/1.0'],
    });
    assert.equal(config['user-agent'], 'CustomAgent/1.0');
  });

  it('should load configuration from file', () => {
    writeFileSync(
      './config.json',
      JSON.stringify({ port: 5050, 'ignore-robots-txt': true }),
      'utf-8',
    );

    resetConfig();

    const config = loadConfig();
    assert.equal(config.port, 5050);
    assert.equal(config['ignore-robots-txt'], true);
  });

  it('should load configuration from yaml file', () => {
    writeFileSync(
      './config.yaml',
      ['port: 7070', 'ignore-robots-txt: true', 'cache-max-size: 10'].join('\n'),
      'utf-8',
    );

    resetConfig();

    const config = loadConfig();
    assert.equal(config.port, 7070);
    assert.equal(config['ignore-robots-txt'], true);
    assert.equal(config['cache-max-size'], 10);
  });

  it('should give priority to environment variables over file', () => {
    writeFileSync(
      './config.json',
      JSON.stringify({ port: 5050, 'ignore-robots-txt': false }),
      'utf-8',
    );

    const originalPort = process.env.MCP_FETCH_PORT;
    process.env.MCP_FETCH_PORT = '6060';

    resetConfig();

    const config = loadConfig();
    assert.equal(config.port, 6060);

    if (originalPort) {
      process.env.MCP_FETCH_PORT = originalPort;
    } else {
      delete process.env.MCP_FETCH_PORT;
    }
  });

  it('should prioritize CLI over defaults', () => {
    const config = loadConfig({
      cliArgs: ['--port', '3000', '--cache-max-size', '100'],
    });
    assert.equal(config.port, 3000);
    assert.equal(config['cache-max-size'], 100);
  });

  it('should validate config with Zod', () => {
    try {
      loadConfig({
        cliArgs: ['--port', 'invalid'],
      });
      assert.fail('Should have thrown validation error');
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });

  it('should convert string values to correct types', () => {
    const config = loadConfig({
      cliArgs: ['--port', '4000', '--cache-max-size', '200'],
    });
    assert.equal(typeof config.port, 'number');
    assert.equal(config.port, 4000);
    assert.equal(typeof config['cache-max-size'], 'number');
    assert.equal(config['cache-max-size'], 200);
  });
});
