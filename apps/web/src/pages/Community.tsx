import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { request } from "../api";
import { SignInPanel } from "../SignInPanel";
import type { AccountContext } from "../Layout";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  stationName: string;
  createdAt: string;
};

export function Community() {
  const { user, setUser } = useOutletContext<AccountContext>();
  const [params] = useSearchParams();
  const providerId = params.get("providerId") ?? "";
  const itemId = params.get("itemId") ?? "";
  const stationName = params.get("name") ?? "";
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const reviews = useQuery({
    queryKey: ["reviews", providerId, itemId],
    queryFn: () =>
      request<Review[]>(`/reviews?providerId=${providerId}&itemId=${itemId}`),
    enabled: !!providerId && !!itemId,
  });
  const submit = useMutation({
    mutationFn: () =>
      request<Review>("/reviews", {
        providerId,
        itemId,
        stationName,
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["reviews", providerId, itemId] });
    },
  });

  if (!providerId || !itemId)
    return (
      <section className="section shell">
        <h2>Community reviews</h2>
        <p className="lede">
          Search for a charger on the <Link to="/locator">Locator</Link> page
          first, then open its reviews from the results list.
        </p>
      </section>
    );

  const average = reviews.data?.length
    ? reviews.data.reduce((sum, item) => sum + item.rating, 0) / reviews.data.length
    : null;

  return (
    <section className="section shell">
      <h2>{stationName || "Station reviews"}</h2>
      <p className="lede">
        {average
          ? `${average.toFixed(1)} ★ average from ${reviews.data?.length} review${reviews.data?.length === 1 ? "" : "s"}`
          : "No reviews yet — be the first driver to share one."}
      </p>

      {user ? (
        <div className="card" style={{ maxWidth: 480, marginBottom: 32 }}>
          <h3>Leave a review</h3>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            <label>
              Rating
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} star{value === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comment (optional)
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
              />
            </label>
            <button className="btn btn-primary" disabled={submit.isPending}>
              Post review
            </button>
            {submit.isSuccess && <p className="notice success">Thanks for sharing!</p>}
          </form>
        </div>
      ) : (
        <SignInPanel message="Sign in with Google to leave a review." setUser={setUser} />
      )}

      <div className="results">
        {reviews.data?.map((review) => (
          <div className="review" key={review.id}>
            <div className="stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div>
            {review.comment && <p>{review.comment}</p>}
            <span className="meta">{new Date(review.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
