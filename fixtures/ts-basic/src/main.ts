/** エントリーポイント。いろいろな書き方の import を集めてある。 */
import { App } from './app';
import { config } from '@/config';
import * as lib from '@lib';
import './polyfill';
// import { ghost } from './ghost';

export const start = () => App(config, lib.formatDate(new Date()));
export const loadLazy = () => import('./lazy');
