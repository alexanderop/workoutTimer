import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/** The saved presets route. */
export class PresetsScreen extends AppScreen {
  static async open(): Promise<PresetsScreen> {
    const app = await renderApp('/presets')
    return new PresetsScreen(app.container, app.cleanup)
  }
}
