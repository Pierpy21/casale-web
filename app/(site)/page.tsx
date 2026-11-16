import { Hero } from "./components/Hero";
import { FestiveMenus } from "./components/FestiveMenus";
import { SeasonalMenus } from "./components/SeasonalMenus";
import { CreateYourOwnMenu } from "./components/CreateYourOwnMenu";
import { ChooseExistingMenu } from "./components/ChooseExistingMenu";
import { RestaurantStory } from "./components/RestaurantStory";
import { FloorPlan } from "./components/FloorPlan";
import { Footer } from "./components/Footer";
import { getMenuCompleto, getTuttiPiatti } from "@/lib/menus";
import type { MenuCategoria, PiattoDettaglio } from "@/lib/menus-types";
import { getFestiveSection } from "@/lib/festive";
import type { FestiveSection } from "@/lib/festive-types";
import { SetupsGallery } from "./components/SetupsGallery";

// I menù sono in cache con tag "menus": le azioni admin la invalidano subito, questo è solo un ripiego.
export const revalidate = 3600;

/** Se PocketBase non risponde la sezione resta vuota invece di far cadere tutta la home. */
async function loadOrFallback<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`Home: impossibile leggere ${label} da PocketBase`, error);
    return fallback;
  }
}

export default async function App() {
  const [dataMenus, tuttiPiatti, festive] = await Promise.all([
    loadOrFallback<MenuCategoria[]>("i menù", () => getMenuCompleto(), []),
    loadOrFallback<Record<string, PiattoDettaglio[]>>("i piatti", () => getTuttiPiatti(), {}),
    loadOrFallback<FestiveSection>("i menù festivi", () => getFestiveSection(), { enabled: false, menus: [], photos: [] }),
  ]);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F7F7F4" }}>
      {/* MARKER-MAKE-KIT-INVOKED */}
      <Hero />

      {/* Buone Feste (menù festivi): non renderizza nulla se spenta o senza menù */}
      <FestiveMenus section={festive} />

      {/* Seasonal Menus */}
      <SeasonalMenus menus={dataMenus} />

      {/* Choose Existing Menu */}
      <ChooseExistingMenu menus={dataMenus} />

      {/* Create Your Own Menu */}
      {/* <CreateYourOwnMenu piatti={tuttiPiatti} /> */}

      <RestaurantStory />
      <FloorPlan />
      <SetupsGallery />
      <Footer />
    </div>
  );
}
