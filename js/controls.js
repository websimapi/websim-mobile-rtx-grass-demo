import * as THREE from 'three';
import nipplejs from 'nipplejs';

export class Controls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        // State
        this.moveVector = new THREE.Vector3(0, 0, 0);
        this.rotationVector = { x: 0, y: 0 };
        this.speed = 10.0;
        this.lookSpeed = 1.5;

        // Joystick
        this.joystickManager = nipplejs.create({
            zone: document.getElementById('zone-joystick'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 100
        });

        this.setupJoystickEvents();
        this.setupTouchLook();
        this.setupKeyboard();
    }

    setupJoystickEvents() {
        this.joystickManager.on('move', (evt, data) => {
            if (data && data.vector) {
                // NippleJS returns vector.y up as positive, but for 3D forward is -Z.
                // data.vector.y is forward (1) to backward (-1) on screen
                // data.vector.x is left (-1) to right (1)
                
                // In 3D: Forward is -Z, Right is +X
                this.moveVector.z = -data.vector.y; 
                this.moveVector.x = data.vector.x;
            }
        });

        this.joystickManager.on('end', () => {
            this.moveVector.set(0, 0, 0);
        });
    }

    setupTouchLook() {
        const lookZone = document.getElementById('zone-look');
        let isDragging = false;
        let previousTouch = { x: 0, y: 0 };

        // Helper to handle both touch and mouse
        const startLook = (x, y) => {
            isDragging = true;
            previousTouch = { x, y };
        };

        const moveLook = (x, y) => {
            if (!isDragging) return;
            
            const deltaX = x - previousTouch.x;
            const deltaY = y - previousTouch.y;
            
            previousTouch = { x, y };
            
            // Apply rotation
            const sensitivity = 0.005;
            this.rotationVector.y -= deltaX * sensitivity * this.lookSpeed;
            this.rotationVector.x -= deltaY * sensitivity * this.lookSpeed;
            
            // Clamp vertical look
            this.rotationVector.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.rotationVector.x));
        };

        const endLook = () => {
            isDragging = false;
        };

        // Touch events
        lookZone.addEventListener('touchstart', (e) => {
            // Prevent default to stop scrolling
            // e.preventDefault(); 
            // We only care about the first changed touch in this zone
            const touch = e.changedTouches[0];
            startLook(touch.clientX, touch.clientY);
        }, { passive: false });

        lookZone.addEventListener('touchmove', (e) => {
            e.preventDefault(); 
            const touch = e.changedTouches[0];
            moveLook(touch.clientX, touch.clientY);
        }, { passive: false });

        lookZone.addEventListener('touchend', endLook);

        // Mouse events for desktop testing
        document.addEventListener('mousedown', (e) => {
            if (e.clientX > window.innerWidth / 2) {
                startLook(e.clientX, e.clientY);
            }
        });
        document.addEventListener('mousemove', (e) => moveLook(e.clientX, e.clientY));
        document.addEventListener('mouseup', endLook);
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'KeyW': this.moveVector.z = -1; break;
                case 'KeyS': this.moveVector.z = 1; break;
                case 'KeyA': this.moveVector.x = -1; break;
                case 'KeyD': this.moveVector.x = 1; break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch(e.code) {
                case 'KeyW': 
                case 'KeyS': this.moveVector.z = 0; break;
                case 'KeyA': 
                case 'KeyD': this.moveVector.x = 0; break;
            }
        });
    }

    update(delta) {
        // Apply rotation
        // We accumulate rotation in rotationVector then apply to quaternion
        const qx = new THREE.Quaternion();
        qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.rotationVector.x);
        
        const qy = new THREE.Quaternion();
        qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationVector.y);
        
        const q = new THREE.Quaternion();
        q.multiply(qy);
        q.multiply(qx);
        
        this.camera.quaternion.copy(q);

        // Apply movement relative to camera direction
        const direction = new THREE.Vector3(this.moveVector.x, 0, this.moveVector.z);
        direction.applyQuaternion(qy); // Only rotate by Y (yaw) so we don't fly up/down
        direction.normalize();
        direction.multiplyScalar(this.speed * delta);

        this.camera.position.add(direction);
        
        // Simple ground collision
        // Assume player height is 1.7
        // We'd need to sample terrain height here ideally.
        // For now, simple clamp above 0.5
        if (this.camera.position.y < 2) this.camera.position.y = 2; 
    }
}

