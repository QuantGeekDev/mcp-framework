import { describe, it, expect } from '@jest/globals';
import {
  generateReactHtmlShell,
  generateReactApp,
  generateReactStyles,
  generateViteConfig,
  generateTsconfigApp,
  REACT_DEPENDENCIES,
  REACT_DEV_DEPENDENCIES,
} from '../../src/cli/templates/react-app.js';

describe('React template generators', () => {
  describe('generateReactHtmlShell', () => {
    it('produces valid HTML with root div and module script', () => {
      const html = generateReactHtmlShell('test-app');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('type="module"');
      expect(html).toContain('src="./App.tsx"');
      expect(html).toContain('<title>test-app</title>');
    });
  });

  describe('generateReactApp', () => {
    const tsx = generateReactApp('my-widget', 'MyWidget');

    it('imports useApp from ext-apps/react', () => {
      expect(tsx).toContain('import { useApp } from "@modelcontextprotocol/ext-apps/react"');
    });

    it('uses the correct component name (PascalCase)', () => {
      expect(tsx).toContain('function MyWidget()');
      expect(tsx).toContain('<MyWidget />');
    });

    it('sets up useApp with appInfo', () => {
      expect(tsx).toContain('appInfo: { name: "my-widget", version: "1.0.0" }');
    });

    it('registers ontoolinput handler', () => {
      expect(tsx).toContain('app.ontoolinput');
    });

    it('registers ontoolresult handler', () => {
      expect(tsx).toContain('app.ontoolresult');
    });

    it('registers onhostcontextchanged handler', () => {
      expect(tsx).toContain('app.onhostcontextchanged');
    });

    it('applies host theme via useEffect', () => {
      expect(tsx).toContain('hostContext?.styles?.variables');
      expect(tsx).toContain('style.setProperty');
    });

    it('imports styles.css', () => {
      expect(tsx).toContain('import "./styles.css"');
    });

    it('calls createRoot and renders in StrictMode', () => {
      expect(tsx).toContain('createRoot(document.getElementById("root")!)');
      expect(tsx).toContain('<StrictMode>');
    });
  });

  describe('generateReactStyles', () => {
    const css = generateReactStyles();

    it('includes host variable fallbacks', () => {
      expect(css).toContain('--color-background-primary');
      expect(css).toContain('--color-text-primary');
      expect(css).toContain('--font-sans');
      expect(css).toContain('--font-mono');
    });

    it('includes light-dark() for theme support', () => {
      expect(css).toContain('light-dark(');
    });

    it('sets box-sizing and body styles', () => {
      expect(css).toContain('box-sizing: border-box');
      expect(css).toContain('padding: 16px');
    });
  });

  describe('generateViteConfig', () => {
    const config = generateViteConfig();

    it('imports react plugin', () => {
      expect(config).toContain('import react from "@vitejs/plugin-react"');
    });

    it('imports viteSingleFile plugin', () => {
      expect(config).toContain('import { viteSingleFile } from "vite-plugin-singlefile"');
    });

    it('uses both plugins', () => {
      expect(config).toContain('plugins: [react(), viteSingleFile()]');
    });

    it('outputs to dist/', () => {
      expect(config).toContain('outDir: "dist"');
    });
  });

  describe('generateTsconfigApp', () => {
    const tsconfig = generateTsconfigApp();

    it('targets ESNext with DOM libs', () => {
      expect(tsconfig).toContain('"ESNext"');
      expect(tsconfig).toContain('"DOM"');
    });

    it('uses react-jsx', () => {
      expect(tsconfig).toContain('"react-jsx"');
    });

    it('uses bundler moduleResolution', () => {
      expect(tsconfig).toContain('"bundler"');
    });

    it('has noEmit true', () => {
      expect(tsconfig).toContain('"noEmit": true');
    });
  });

  describe('dependency lists', () => {
    it('REACT_DEPENDENCIES includes ext-apps and react', () => {
      expect(REACT_DEPENDENCIES).toContain('@modelcontextprotocol/ext-apps');
      expect(REACT_DEPENDENCIES).toContain('react');
      expect(REACT_DEPENDENCIES).toContain('react-dom');
    });

    it('REACT_DEV_DEPENDENCIES includes vite and react types', () => {
      expect(REACT_DEV_DEPENDENCIES).toContain('vite');
      expect(REACT_DEV_DEPENDENCIES).toContain('vite-plugin-singlefile');
      expect(REACT_DEV_DEPENDENCIES).toContain('@vitejs/plugin-react');
      expect(REACT_DEV_DEPENDENCIES).toContain('@types/react');
      expect(REACT_DEV_DEPENDENCIES).toContain('@types/react-dom');
    });
  });
});
