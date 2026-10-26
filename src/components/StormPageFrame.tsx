import type { ReactNode } from "react";
import { WeatherMoodProvider, useWeatherMood } from "../hooks/useWeatherMood";
import { SignInStormBackdrop } from "./SignInStormBackdrop";
import { WeatherMoodToggle } from "./WeatherMoodToggle";

type StormPageFrameProps = {
  children: ReactNode;
  embeddedWeather?: boolean;
};

function StormPageFrameInner({ children, embeddedWeather }: StormPageFrameProps) {
  const { isEnraged } = useWeatherMood();

  return (
    <div className="sign-in-page relative min-h-screen overflow-hidden">
      <a
        href="#admin-content"
        className="sr-only z-50 rounded-md bg-white p-3 text-night focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SignInStormBackdrop active={isEnraged} />
      {!embeddedWeather ? <WeatherMoodToggle /> : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function StormPageFrame({ children, embeddedWeather = false }: StormPageFrameProps) {
  return (
    <WeatherMoodProvider>
      <StormPageFrameInner embeddedWeather={embeddedWeather}>{children}</StormPageFrameInner>
    </WeatherMoodProvider>
  );
}
