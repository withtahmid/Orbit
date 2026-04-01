import { createContext, useContext } from "react";
import { rootStore, RootStore } from "./RootStore";

const StoreContext = createContext<RootStore>(rootStore);

export const StoreProvider = StoreContext.Provider;

/**
 * useStore — access the root MobX store from any component.
 *
 * Usage:
 *   const { authStore } = useStore();
 */
export function useStore(): RootStore {
    return useContext(StoreContext);
}
