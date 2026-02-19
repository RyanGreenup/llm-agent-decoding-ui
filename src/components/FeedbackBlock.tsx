interface FeedbackBlockProps {
  title: string;
  content: string;
}

export default function FeedbackBlock(props: FeedbackBlockProps) {
  return (
    <div>
      <h4 class="text-xs font-bold uppercase opacity-50 mb-1">
        {props.title}
      </h4>
      <pre class="text-xs whitespace-pre-wrap bg-base-300 rounded p-2 max-h-48 overflow-auto">
        {props.content}
      </pre>
    </div>
  );
}
