export function RoomCapacity({ count }: { count: number }) {
    return (
        <div className="yanwu-room-capacity" aria-label={`参战人数 ${count} / 10`}>
            <div>
                <span>在场人数</span>
                <strong>{count} / 10 · {count >= 10 ? "已满员" : `尚余 ${10 - count} 位`}</strong>
            </div>
            <div className="yanwu-seat-strip" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => <i key={index} data-filled={index < count} />)}
            </div>
        </div>
    );
}
