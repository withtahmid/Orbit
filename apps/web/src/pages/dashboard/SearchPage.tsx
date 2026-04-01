import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ROUTES } from "@/router/routes";

/**
 * SearchPage — /search?q=...&page=...
 *
 * Demonstrates reading AND updating query params with useSearchParams().
 * Query params are reflected in the URL so they're shareable/bookmarkable.
 */
export function SearchPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Read current values from URL
    const q = searchParams.get("q") ?? "";
    const page = Number(searchParams.get("page") ?? "1");

    // Local input state — sync from URL on mount
    const [inputValue, setInputValue] = useState(q);

    useEffect(() => {
        setInputValue(q);
    }, [q]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        // Update the URL (replaces history entry to avoid back-button spam)
        setSearchParams({ q: inputValue, page: "1" }, { replace: true });
    };

    const goToPage = (newPage: number) => {
        setSearchParams({ q, page: String(newPage) });
    };

    return (
        <div>
            <h1>Search</h1>

            <form onSubmit={handleSearch}>
                <input
                    type="search"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Search…"
                />
                <button type="submit">Search</button>
            </form>

            {q && (
                <p>
                    Results for <strong>"{q}"</strong> — page {page}
                </p>
            )}

            {/* Pagination */}
            <div>
                <button disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    ← Prev
                </button>
                <span> Page {page} </span>
                <button onClick={() => goToPage(page + 1)}>Next →</button>
            </div>

            {/* Programmatic navigation with query params */}
            <button onClick={() => navigate(ROUTES.searchWithQuery({ q: "mobx", page: "1" }))}>
                Search "mobx"
            </button>
        </div>
    );
}
