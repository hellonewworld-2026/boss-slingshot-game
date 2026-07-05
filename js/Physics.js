class Physics {
    static checkWallCollision(actor, width, height) {
        // 左右の壁反射
        if (actor.x - actor.radius < 0) {
            actor.x = actor.radius;
            actor.vx = -actor.vx * actor.rebound;
            return true;
        }
        if (actor.x + actor.radius > width) {
            actor.x = width - actor.radius;
            actor.vx = -actor.vx * actor.rebound;
            return true;
        }
        // 下壁反射（オフィス入口）
        if (actor.y + actor.radius > height) {
            actor.y = height - actor.radius;
            actor.vy = -actor.vy * actor.rebound;
            return true;
        }
        // 上壁反射（エレベーター付近）
        if (actor.y - actor.radius < 0) {
            actor.y = actor.radius;
            actor.vy = -actor.vy * actor.rebound;
            return true;
        }
        return false;
    }

    static checkCircleCollision(c1, c2) {
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (c1.radius + c2.radius);
    }

    // 矩形（障害物デスク等）との衝突反射判定
    static resolveObstacleCollision(actor, rect) {
        // 矩形の最近傍点を求める
        const closestX = Math.max(rect.x, Math.min(actor.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(actor.y, rect.y + rect.height));

        const dx = actor.x - closestX;
        const dy = actor.y - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < actor.radius) {
            // 衝突方向の特定と反射処理
            const overlap = actor.radius - distance;
            
            // 法線ベクトルの算出
            let nx = 0;
            let ny = 0;
            if (distance === 0) {
                ny = -1; // 例外処理
            } else {
                nx = dx / distance;
                ny = dy / distance;
            }

            // めり込み防止の押し出し
            actor.x += nx * overlap;
            actor.y += ny * overlap;

            // 反射ベクトル計算: V' = V - 2*(V・N)*N
            const dotProduct = actor.vx * nx + actor.vy * ny;
            actor.vx = (actor.vx - 2 * dotProduct * nx) * actor.rebound;
            actor.vy = (actor.vy - 2 * dotProduct * ny) * actor.rebound;

            return true;
        }
        return false;
    }
}