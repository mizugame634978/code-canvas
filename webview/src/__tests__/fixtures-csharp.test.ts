import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixtureGraph';

// End to end over fixtures/csharp-wpf: C# edges follow the types a file
// actually uses, resolved through its own namespace (and its parents), its
// `using`s and the project's `global using`s - not every file of a namespace.
let result: Awaited<ReturnType<typeof fixtureGraph>>;

beforeAll(async () => {
    result = await fixtureGraph('csharp-wpf');
});

describe('fixtures/csharp-wpf', () => {
    it('draws an edge per used type, and none for an unused using', () => {
        expect(result.edges).toEqual([
            // XAML: x:Class -> code-behind, StartupUri / Source -> XAML, prefix:Type -> C# type.
            'App.xaml <- App.xaml.cs [App]',
            'App.xaml <- Themes/Colors.xaml [Colors.xaml]',
            'App.xaml <- Views/MainWindow.xaml [MainWindow.xaml]',
            'Models/Order.cs <- Models/Customer.cs [Customer]',
            // A partial class lives in every file that declares a part of it.
            'Services/OrderService.cs <- Models/Order.Validation.cs [Order]',
            'Services/OrderService.cs <- Models/Order.cs [Order]',
            'ViewModels/MainViewModel.cs <- Models/Order.Validation.cs [Order]',
            'ViewModels/MainViewModel.cs <- Models/Order.cs [Order]',
            'ViewModels/MainViewModel.cs <- Services/OrderService.cs [OrderService]',
            'ViewModels/MainViewModel.cs <- ViewModels/ViewModelBase.cs [ViewModelBase]',
            'ViewModels/SettingsViewModel.cs <- Services/SettingsStore.cs [SettingsStore]',
            'ViewModels/SettingsViewModel.cs <- ViewModels/ViewModelBase.cs [ViewModelBase]',
            'Views/MainWindow.xaml <- ViewModels/MainViewModel.cs [MainViewModel]',
            'Views/MainWindow.xaml <- ViewModels/SettingsViewModel.cs [SettingsViewModel]',
            'Views/MainWindow.xaml <- Views/MainWindow.xaml.cs [MainWindow]',
        ]);
    });

    it('ignores type names in comments, strings and using directives', () => {
        expect(result.isolated).toEqual(['GlobalUsings.cs']);
    });
});
