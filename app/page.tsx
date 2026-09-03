import { Hero } from "./components/Hero";
import { SeasonalMenus } from "./components/SeasonalMenus";
import { CreateYourOwnMenu } from "./components/CreateYourOwnMenu";
import { RestaurantStory } from "./components/RestaurantStory";
import { FloorPlan } from "./components/FloorPlan";
import { Footer } from "./components/Footer";
import { getMenuCompleto, getTuttiPiatti } from "@/lib/notion";
import { SetupsGallery } from "./components/SetupsGallery";

export default async function App() {

  const dataMenus = await getMenuCompleto();
  const tuttiPiatti = await getTuttiPiatti();

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F7F7F4" }}>
      {/* MARKER-MAKE-KIT-INVOKED */}
      <Hero />

      {/* Seasonal Menus */}
      <SeasonalMenus menus={dataMenus} />

      {/* Create Your Own Menu */}
      {/* <CreateYourOwnMenu piatti={tuttiPiatti} /> */}

      <RestaurantStory />
      <FloorPlan />
      <SetupsGallery />
      <Footer />
    </div>
  );
}