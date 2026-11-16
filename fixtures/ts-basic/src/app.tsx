/** 画面の組み立て。パッケージ・フォルダの index・型だけの import を使う。 */
import React from 'react';
import { Button, type ButtonProps } from './components';
import type { User } from './types';

export function App(config: { title: string }, today: string) {
    const user: User = { name: 'alice' };
    const props: ButtonProps = { label: `${config.title} ${user.name} ${today}` };
    return React.createElement(Button, props);
}
