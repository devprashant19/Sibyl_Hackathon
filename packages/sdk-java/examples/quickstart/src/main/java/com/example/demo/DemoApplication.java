package com.example.demo;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}

@Entity
@Table(name = "products")
class Product {
    @Id
    public Long id;
    public Integer inventory;
}

interface ProductRepository extends JpaRepository<Product, Long> {}

@RestController
@RequestMapping("/api")
class CheckoutController {
    private final ProductRepository repository;

    public CheckoutController(ProductRepository repository) {
        this.repository = repository;
    }

    static class CheckoutRequest {
        public Long productId;
        public Integer quantity;
    }

    // THE BUG: We use READ_COMMITTED isolation and no pessimistic locking (e.g., SELECT FOR UPDATE).
    // This allows two concurrent threads to read the same inventory and both update it.
    @PostMapping("/checkout")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ResponseEntity<?> checkout(@RequestBody CheckoutRequest req) {
        Product p = repository.findById(req.productId).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();
        
        if (p.inventory < req.quantity) {
            return ResponseEntity.badRequest().body("Out of stock");
        }

        p.inventory = p.inventory - req.quantity;
        repository.save(p);

        return ResponseEntity.ok().body("Success: " + p.inventory + " remaining");
    }
}
