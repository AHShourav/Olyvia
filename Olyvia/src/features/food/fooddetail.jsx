import { useParams } from "react-router-dom";

export default function FoodDetail() {
  const { foodId } = useParams();

  return <div>Food Detail: {foodId}</div>;
}