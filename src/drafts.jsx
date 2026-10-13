import { createContext, useContext, useEffect, useRef, useState } from "react";
const Context = createContext(null);
export function DraftProvider({ children }) {
  const [entries, setEntries] = useState(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem("reach-out-drafts-v2") || "{}",
      );
      if (!stored || typeof stored !== "object" || Array.isArray(stored))
        return {};
      return Object.fromEntries(
        Object.entries(stored).filter(
          ([, entry]) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.base === "string" &&
            Object.hasOwn(entry, "value"),
        ),
      );
    } catch {
      return {};
    }
  });
  const [storageError, setStorageError] = useState("");
  const dirty = Object.keys(entries).length > 0;
  useEffect(() => {
    try {
      sessionStorage.setItem("reach-out-drafts-v2", JSON.stringify(entries));
      setStorageError("");
    } catch {
      setStorageError(
        "Tussentijds bewaren in dit tabblad lukt niet. Sla je wijzigingen op voordat je sluit.",
      );
    }
  }, [entries]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <Context.Provider value={{ entries, setEntries }}>
      {dirty && (
        <div className="draft-banner" role="status">
          {storageError ||
            "Je hebt onopgeslagen wijzigingen. Ze blijven in dit tabblad bewaard wanneer je van scherm wisselt."}
          <button
            className="text-button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(entries, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "reach-out-onopgeslagen-formulieren.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Invoer downloaden
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (
                window.confirm(
                  "Alle onopgeslagen formulierwijzigingen in dit tabblad verwerpen? Opgeslagen gegevens blijven behouden.",
                )
              )
                setEntries({});
            }}
          >
            Onopgeslagen invoer verwerpen
          </button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function useDraft(key, initial) {
  const { entries, setEntries } = useContext(Context);
  const serialized = JSON.stringify(initial);
  const baseline = useRef(serialized);
  const entry = entries[key];
  if (!entry) baseline.current = serialized;
  // Keep damaged drafts downloadable, but do not feed malformed field values
  // into inputs or array operations. A conflict requires explicit dismissal.
  const usable = !entry || draftShapeMatches(initial, entry.value);
  const value = entry && usable ? entry.value : initial;
  const setValue = (next) =>
    setEntries((all) => {
      const current = usable ? (all[key]?.value ?? initial) : initial;
      return {
        ...all,
        [key]: {
          base: all[key]?.base ?? baseline.current,
          value: typeof next === "function" ? next(current) : next,
        },
      };
    });
  const clear = () =>
    setEntries((all) => {
      // A save response must not erase text entered while that save was pending.
      if (
        usable &&
        all[key] &&
        JSON.stringify(all[key].value) !== JSON.stringify(value)
      )
        return all;
      const next = { ...all };
      delete next[key];
      return next;
    });
  return [
    value,
    setValue,
    clear,
    {
      dirty: !!entry,
      conflict: !!entry && (!usable || entry.base !== serialized),
    },
  ];
}
function draftShapeMatches(expected, actual) {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.every((value) =>
        expected.length
          ? draftShapeMatches(expected[0], value)
          : value &&
            typeof value === "object" &&
            typeof value.start === "string" &&
            typeof value.end === "string",
      )
    );
  if (expected && typeof expected === "object")
    return (
      actual &&
      typeof actual === "object" &&
      !Array.isArray(actual) &&
      Object.entries(expected).every(([key, value]) =>
        draftShapeMatches(value, actual[key]),
      )
    );
  // Number inputs produce strings while the user is typing.
  if (typeof expected === "number")
    return typeof actual === "number" || typeof actual === "string";
  return typeof actual === typeof expected;
}
